import fs from 'fs-extra'
import path from 'node:path'
import type { RunFunction } from '@data-fair/lib-common-types/processings.js'
import type { ProcessingConfig } from '#types/processingConfig/index.ts'
import { type AdministrativeLevel, type SimplifyLevel, SIMPLIFY_TOLERANCES, YEARS, getSourceForLevel, isLevelAvailable } from './sources.ts'
import { downloadArchive } from './download.ts'
import { convertLayer } from './convert.ts'
import { createTerritoryMemory, loadChefLieux, normalizeGeojson } from './normalize.ts'
import { getDatasetSchema } from './schemas.ts'
import { getDatasetMetadata } from './metadata.ts'
import { fetchExistingDatasetsBySlug, uploadDataset } from './upload.ts'
import { isStopError, resetStopState, setShouldBeStopped } from './state.ts'

// Higher levels first: they feed the memory used to enrich the lower ones
export const LEVEL_ORDER: AdministrativeLevel[] = ['region', 'departement', 'arrondissement', 'canton', 'epci', 'commune', 'arrondissement-municipal', 'iris']

const LEVEL_LABELS: Record<AdministrativeLevel, string> = {
  region: 'Régions',
  departement: 'Départements',
  arrondissement: 'Arrondissements',
  canton: 'Cantons',
  epci: 'EPCI',
  commune: 'Communes',
  'arrondissement-municipal': 'Arrondissements municipaux',
  iris: 'IRIS'
}

export const stop = async (): Promise<void> => {
  setShouldBeStopped(true)
}

type DatasetRef = { id: string, title: string }
export interface Target { year: number, level: AdministrativeLevel, simplifyLevel: SimplifyLevel, dataset?: DatasetRef }

const SIMPLIFY_LEVELS = Object.keys(SIMPLIFY_TOLERANCES) as SimplifyLevel[]
const targetLabel = (t: Target) => `${t.year} ${t.level} (${t.simplifyLevel})`

/**
 * The datasets to produce, without duplicates, most recent millésime first (older deliveries
 * then inherit the most complete labels) and from region down (the higher levels feed the
 * memory used to enrich the lower ones).
 */
export const getTargets = (config: ProcessingConfig): Target[] => {
  let rows: Target[]
  if (config.datasetMode === 'create') {
    const combinations = config.createAll
      ? LEVEL_ORDER.flatMap(level => SIMPLIFY_LEVELS.map(simplifyLevel => ({ level, simplifyLevel })))
      : config.datasets ?? []
    rows = (config.years?.length ? config.years : [YEARS[0]]).flatMap(year => combinations.map(c => ({ ...c, year })))
  } else {
    rows = (config.datasets ?? []) as Target[]
  }
  const unique = [...new Map(rows.map(row => [targetLabel(row), row])).values()]
  const rank = (t: Target) => LEVEL_ORDER.indexOf(t.level)
  return unique.sort((a, b) => b.year - a.year || rank(a) - rank(b))
}

export const run: RunFunction<ProcessingConfig> = async (context) => {
  resetStopState()
  const { processingConfig, axios, log, tmpDir, patchConfig } = context

  const create = processingConfig.datasetMode === 'create'
  const combineCommunesAndPlm = processingConfig.combineCommunesAndPlm !== false
  const enableVtPrepare = processingConfig.enableVtPrepare !== false
  const datasetIdPrefix = (create && processingConfig.datasetIdPrefix) || 'france-contours'
  const skipUpload = processingConfig.skipUpload === true

  const allTargets = getTargets(processingConfig)
  const unavailable = allTargets.filter(t => !isLevelAvailable(t.year, t.level))
  const targets = allTargets.filter(t => isLevelAvailable(t.year, t.level))
  if (!targets.length) throw new Error('Aucun jeu de données à produire : ajoutez au moins une ligne dans l\'onglet Jeux de données.')
  const missing = targets.filter(t => !create && !t.dataset?.id)
  if (missing.length) throw new Error(`Jeu de données à mettre à jour non renseigné pour : ${missing.map(targetLabel).join(', ')}`)

  await log.step('Configuration')
  await log.info(`${create ? 'Création' : 'Mise à jour'} de ${targets.length} jeu(x) de données, millésimes ${[...new Set(targets.map(t => t.year))].join(', ')}.`)
  if (unavailable.length) await log.warning(`Ignorés, niveau absent de la livraison IGN : ${unavailable.map(targetLabel).join(', ')}`)

  try {
    const existingBySlug = create && !skipUpload ? await fetchExistingDatasetsBySlug(axios, log) : new Map()
    const memory = createTerritoryMemory()

    for (const year of [...new Set(targets.map(t => t.year))]) {
      const downloadDir = path.join(tmpDir, 'downloads', String(year))
      for (const level of LEVEL_ORDER) {
        const levelTargets = targets.filter(t => t.year === year && t.level === level)
        if (!levelTargets.length) continue
        const levelTitle = LEVEL_LABELS[level]
        await log.step(`${year} — ${levelTitle}`)

        const source = getSourceForLevel(year, level)
        const mergeArm = level === 'commune' && combineCommunesAndPlm
        const armLayer = mergeArm && isLevelAvailable(year, 'arrondissement-municipal') ? getSourceForLevel(year, 'arrondissement-municipal').layer : null
        const extracted: { extractDir: string, format: typeof source.archives[number]['format'] }[] = []
        const chefLieuPaths: string[] = []

        // Download and chef-lieu join once, whatever the number of simplifications
        for (const archive of source.archives) {
          const { extractDir } = await downloadArchive(archive.url, downloadDir, axios, log)
          extracted.push({ extractDir, format: archive.format })
          if (source.chefLieuLayer) {
            const outputDir = path.join(tmpDir, 'geojson', 'chef-lieu', path.basename(extractDir))
            chefLieuPaths.push(...await convertLayer({ extractDir, format: archive.format, layer: source.chefLieuLayer, outputDir, simplifyTolerance: null, optional: true, log }))
          }
        }
        if (chefLieuPaths.length) await loadChefLieux(chefLieuPaths, memory)

        const schema = getDatasetSchema(level, { year, enableVtPrepare, combineCommunesAndPlm })
        const metadata = getDatasetMetadata(level, year, source, { combineCommunesAndPlm })

        for (const target of levelTargets) {
          const { simplifyLevel } = target
          const simplifyTolerance = SIMPLIFY_TOLERANCES[simplifyLevel]
          const paths: string[] = []
          const armPaths: string[] = []
          for (const { extractDir, format } of extracted) {
            const outputDir = path.join(tmpDir, 'geojson', simplifyLevel, path.basename(extractDir))
            const convert = (layer: string, optional = false) =>
              convertLayer({ extractDir, format, layer, outputDir, simplifyTolerance, optional, log })
            paths.push(...await convert(source.layer))
            if (armLayer) armPaths.push(...await convert(armLayer, true))
          }
          if (mergeArm && armPaths.length === 0) await log.warning(`Arrondissements municipaux introuvables pour ${year}, les communes de Paris, Lyon et Marseille sont conservées telles quelles.`)

          const slug = `${datasetIdPrefix}-${year}-${level}-${simplifyLevel}`
          const normalizedPath = path.join(tmpDir, 'normalized', `${slug}.geojson`)
          await fs.ensureDir(path.dirname(normalizedPath))
          const count = await normalizeGeojson(
            { paths, armPaths },
            normalizedPath,
            level,
            year,
            memory,
            // the standalone arrondissement-municipal level keeps its own shape whatever the PLM option
            { combineCommunesAndPlm: mergeArm, keepPlmParents: armPaths.length === 0, schemaKeys: new Set(schema.map(p => p.key)) },
            log
          )
          if (count === 0) throw new Error(`Aucune entité produite pour ${targetLabel(target)}`)

          if (skipUpload) {
            await log.info(`Simulation : ${count} entités pour ${targetLabel(target)}, aucun jeu de données créé ni modifié.`)
            continue
          }
          const title = `Contours administratifs ${year} - ${levelTitle} (${simplifyLevel})`
          // create mode reuses a dataset of the account that already has the slug (e.g. a previous interrupted run)
          const existing = create ? existingBySlug.get(slug) : target.dataset
          target.dataset = await uploadDataset({ slug, title, filePath: normalizedPath, schema, metadata, count }, existing, axios, log)
        }
      }
      // a millésime weighs several GB once extracted and converted: free the disk before the next one
      await Promise.all(['downloads', 'geojson', 'normalized'].map(dir => fs.remove(path.join(tmpDir, dir))))
    }

    if (create && !skipUpload) {
      const datasets = targets.map(({ year, level, simplifyLevel, dataset }) => ({ year, level, simplifyLevel, dataset }))
      await patchConfig({ datasetMode: 'update', datasets, years: undefined, createAll: undefined, datasetIdPrefix: undefined } as any)
      await log.info('Configuration basculée en mise à jour des jeux de données créés.')
    }
  } catch (err) {
    if (!isStopError(err)) throw err
    await log.warning('Traitement interrompu, pas de publication')
  }
}
