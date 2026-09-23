import fs from 'fs-extra'
import path from 'node:path'
import type { RunFunction } from '@data-fair/lib-common-types/processings.js'
import type { ProcessingConfig } from '#types/processingConfig/index.ts'
import { type AdministrativeLevel, SIMPLIFY_TOLERANCES, YEARS, getSourceForLevel } from './sources.ts'
import { downloadArchive } from './download.ts'
import { convertLayer } from './convert.ts'
import { createTerritoryMemory, loadChefLieux, normalizeGeojson } from './normalize.ts'
import { getDatasetSchema } from './schemas.ts'
import { getDatasetMetadata } from './metadata.ts'
import { fetchExistingDatasetsBySlug, uploadDataset } from './upload.ts'
import { isStopError, resetStopState, setShouldBeStopped } from './state.ts'

// Higher levels first: they feed the memory used to enrich the lower ones
const LEVEL_ORDER: AdministrativeLevel[] = ['region', 'departement', 'epci', 'commune', 'arrondissement-municipal', 'iris']

const LEVEL_LABELS: Record<AdministrativeLevel, string> = {
  region: 'Régions',
  departement: 'Départements',
  epci: 'EPCI',
  commune: 'Communes',
  'arrondissement-municipal': 'Arrondissements municipaux',
  iris: 'IRIS'
}

export const stop = async (): Promise<void> => {
  setShouldBeStopped(true)
}

export const run: RunFunction<ProcessingConfig> = async (context) => {
  resetStopState()
  const { processingConfig, axios, log, tmpDir } = context

  // Most recent first: the memory then carries the most complete labels down to older millésimes
  const years = [...(processingConfig.years ?? [YEARS[0]])].sort((a, b) => b - a)
  const requestedLevels = processingConfig.levels ?? ['region', 'departement', 'epci', 'commune']
  const levels = LEVEL_ORDER.filter(l => requestedLevels.includes(l))
  const simplifyLevels = processingConfig.simplifyLevels?.length ? processingConfig.simplifyLevels : ['medium' as const]
  const combineCommunesAndPlm = processingConfig.combineCommunesAndPlm !== false
  const enableVtPrepare = processingConfig.enableVtPrepare !== false
  const datasetIdPrefix = processingConfig.datasetIdPrefix || 'france-contours'
  const skipUpload = processingConfig.skipUpload === true

  await log.step('Configuration')
  await log.info(`Millésimes : ${years.join(', ')}`)
  await log.info(`Niveaux : ${levels.join(', ')}`)
  await log.info(`Simplifications : ${simplifyLevels.join(', ')}`)

  try {
    const existingBySlug = skipUpload ? new Map() : await fetchExistingDatasetsBySlug(axios, log)
    const memory = createTerritoryMemory()

    for (const year of years) {
      for (const level of levels) {
        const levelTitle = LEVEL_LABELS[level]
        await log.step(`${year} — ${levelTitle}`)

        const source = getSourceForLevel(year, level)
        const mergeArm = level === 'commune' && combineCommunesAndPlm
        const armLayer = mergeArm ? getSourceForLevel(year, 'arrondissement-municipal').layer : null
        const downloadDir = path.join(tmpDir, 'downloads', String(year))
        const extracted: { extractDir: string, format: typeof source.archives[number]['format'] }[] = []
        const chefLieuPaths: string[] = []

        // Download and chef-lieu join once, whatever the number of simplifications
        for (const archive of source.archives) {
          const { extractDir } = await downloadArchive(archive.url, downloadDir, axios, log)
          extracted.push({ extractDir, format: archive.format })
          if (source.chefLieuLayer) {
            const outputDir = path.join(tmpDir, 'geojson', String(year), 'chef-lieu', path.basename(extractDir))
            chefLieuPaths.push(...await convertLayer({ extractDir, format: archive.format, layer: source.chefLieuLayer, outputDir, simplifyTolerance: null, optional: true, log }))
          }
        }
        if (chefLieuPaths.length) await loadChefLieux(chefLieuPaths, memory)

        const schema = getDatasetSchema(level, { year, enableVtPrepare, combineCommunesAndPlm })
        const metadata = getDatasetMetadata(level, year, source, { combineCommunesAndPlm })

        for (const simplifyLevel of simplifyLevels) {
          const simplifyTolerance = SIMPLIFY_TOLERANCES[simplifyLevel]
          await log.info(`Simplification ${simplifyLevel}${simplifyTolerance ? ` (${simplifyTolerance}°)` : ''}`)
          const paths: string[] = []
          const armPaths: string[] = []
          for (const { extractDir, format } of extracted) {
            const outputDir = path.join(tmpDir, 'geojson', String(year), simplifyLevel, path.basename(extractDir))
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
          if (count === 0) throw new Error(`Aucune entité produite pour ${level} (${year}, ${simplifyLevel})`)

          if (skipUpload) {
            await log.info('Mode simulation actif : le jeu de données n\'est ni créé ni mis à jour.')
          } else {
            const title = `Contours administratifs ${year} - ${levelTitle} (${simplifyLevel})`
            await uploadDataset({ slug, title, filePath: normalizedPath, schema, metadata }, existingBySlug, axios, log)
          }
        }
      }
    }
  } catch (err) {
    if (!isStopError(err)) throw err
    await log.warning('Traitement interrompu, pas de publication')
  }
}
