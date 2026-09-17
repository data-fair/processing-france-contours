import { strict as assert } from 'node:assert'
import { after, before, beforeEach, describe, it } from 'node:test'
import fs from 'fs-extra'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import * as plugin from '../index.ts'
import processingConfigSchema from '../processing-config-schema.json' with { type: 'json' }
import { ADMIN_EXPRESS_ARCHIVES, IRIS_ARCHIVES, SIMPLIFY_TOLERANCES, YEARS, getSourceForLevel } from '../lib/sources.ts'
import { getDatasetSchema } from '../lib/schemas.ts'
import { getDatasetMetadata } from '../lib/metadata.ts'
import { createTerritoryMemory, formatInseeCode, loadChefLieux, normalizeFeature, normalizeGeojson, parseGeojsonFeatures } from '../lib/normalize.ts'
import { convertLayer } from '../lib/convert.ts'
import { extract7z } from '../lib/extract.ts'
import { runCommand } from '../lib/exec.ts'
import { StopError, isStopped, resetStopState } from '../lib/state.ts'

const hasBinary = async (bin: string): Promise<boolean> => {
  try {
    await promisify(execFile)(bin, ['--version'])
    return true
  } catch (err: any) {
    return err.code !== 'ENOENT'
  }
}
const has7z = await hasBinary('7z')
const hasOgr2ogr = await hasBinary('ogr2ogr')

const log = {
  step: async () => {},
  task: async () => {},
  progress: async () => {},
  info: async () => {},
  debug: async () => {},
  warning: async () => {},
  error: async () => {}
} as any

const keysOf = (level: Parameters<typeof getDatasetSchema>[0], year = 2026, combineCommunesAndPlm = true) =>
  new Set(getDatasetSchema(level, { year, combineCommunesAndPlm }).map(p => p.key))

// A circle in Lambert-93 (EPSG:2154): 400 vertices, 500 m radius
const lambertCircle = () => {
  const [x0, y0] = [650000, 6860000]
  const ring = Array.from({ length: 400 }, (_, i) => [x0 + 500 * Math.cos(2 * Math.PI * i / 400), y0 + 500 * Math.sin(2 * Math.PI * i / 400)])
  ring.push(ring[0])
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: { INSEE_REG: '84', NOM_REG: 'Test', CHF_REG: '69123' }, geometry: { type: 'Polygon', coordinates: [ring] } }]
  }
}

describe('Processing France Contours', () => {
  let tmpDir: string
  before(async () => { tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'france-contours-test-')) })
  after(async () => { await fs.remove(tmpDir) })

  describe('configuration schema', () => {
    it('is a tabs layout without legacy x-* keywords', () => {
      assert.equal(processingConfigSchema.type, 'object')
      assert.equal(processingConfigSchema.layout, 'tabs')
      const legacy = JSON.stringify(processingConfigSchema).match(/"x-(?!exports|i18n)[a-zA-Z-]+"/g)
      assert.equal(legacy, null, `legacy x-* keywords: ${legacy?.join(', ')}`)
    })

    it('labels the technical enum values', () => {
      const levels = processingConfigSchema.allOf[0].properties.levels
      assert.deepEqual(levels.layout.items.map(i => i.value), levels.items.enum)
      const simplify = processingConfigSchema.allOf[1].properties.simplifyLevel
      assert.deepEqual(simplify.layout.items.map(i => i.value), simplify.enum)
      assert.deepEqual(simplify.enum, Object.keys(SIMPLIFY_TOLERANCES))
    })

    it('offers exactly the years that have a source', () => {
      assert.deepEqual(processingConfigSchema.allOf[0].properties.years.items.enum, YEARS)
      assert.deepEqual(Object.keys(IRIS_ARCHIVES).map(Number).sort(), Object.keys(ADMIN_EXPRESS_ARCHIVES).map(Number).sort())
    })
  })

  describe('IGN sources', () => {
    it('serves ADMIN-EXPRESS-COG from the Géoplateforme, GeoPackage from 2025', () => {
      for (const year of YEARS) {
        const source = getSourceForLevel(year, 'commune')
        assert.equal(source.archives.length, 1)
        assert.ok(source.archives[0].url.startsWith('https://data.geopf.fr/telechargement/download/ADMIN-EXPRESS-COG/'))
        assert.equal(source.archives[0].format, year >= 2025 ? 'gpkg' : 'shp')
      }
    })

    it('joins the chef-lieu point layers only for the GeoPackage deliveries', () => {
      assert.equal(getSourceForLevel(2026, 'region').chefLieuLayer, 'chef_lieu_de_region')
      assert.equal(getSourceForLevel(2026, 'departement').chefLieuLayer, 'chef_lieu_de_departement')
      assert.equal(getSourceForLevel(2026, 'commune').chefLieuLayer, undefined)
      assert.equal(getSourceForLevel(2024, 'region').chefLieuLayer, undefined)
    })

    it('follows the CONTOURS-IRIS packaging changes', () => {
      assert.equal(getSourceForLevel(2017, 'iris').archives[0].url, 'https://data.geopf.fr/telechargement/download/CONTOURS-IRIS/CONTOURS-IRIS_2-1__SHP__FRA_2017-01-01/CONTOURS-IRIS_2-1__SHP__FRA_2017-01-01.7z')
      assert.equal(getSourceForLevel(2023, 'iris').layer, 'CONTOURS-IRIS')
      for (const year of [2024, 2025]) {
        const source = getSourceForLevel(year, 'iris')
        assert.equal(source.archives.length, 9, 'one archive per territory')
        assert.ok(source.archives.every(a => a.format === 'gpkg' && a.url.includes(`_${year}-01-01`)))
        assert.equal(source.layer, 'contours_iris')
      }
      const iris2026 = getSourceForLevel(2026, 'iris')
      assert.equal(iris2026.archives.length, 1)
      assert.ok(iris2026.archives[0].url.includes('GPKG_WGS84G_FRA_2026-01-01'))
    })

    it('refuses an unknown year instead of substituting another one', () => {
      assert.throws(() => getSourceForLevel(2016, 'commune'), /2016/)
      assert.throws(() => getSourceForLevel(2027, 'iris'), /2027/)
    })
  })

  describe('dataset schemas', () => {
    it('types every administrative code as a string with its concept', () => {
      const schema = getDatasetSchema('commune', { year: 2026, combineCommunesAndPlm: true })
      for (const [key, concept] of [['INSEE_COM', 'codeCommune'], ['INSEE_DEP', 'codeDepartement'], ['INSEE_REG', 'codeRegion']]) {
        const prop = schema.find(p => p.key === key)
        assert.equal(prop?.type, 'string')
        assert.equal(prop?.['x-refersTo'], `http://rdf.insee.fr/def/geo#${concept}`)
      }
      assert.equal(schema.find(p => p.key === 'CODE_EPCI')?.type, 'string')
      assert.ok(schema.find(p => p.key === 'INSEE_RATT'))
      assert.ok(!getDatasetSchema('commune', { year: 2026, combineCommunesAndPlm: false }).find(p => p.key === 'INSEE_RATT'))
      assert.ok(!getDatasetSchema('commune', { year: 2017 }).find(p => p.key === 'POPULATION'))
    })

    it('declares vtPrepare on the "geometry" column data-fair creates for a GeoJSON', () => {
      const withVt = getDatasetSchema('commune', { year: 2026, enableVtPrepare: true })
      const geometry = withVt.find(p => p['x-refersTo'] === 'https://purl.org/geojson/vocab#geometry')
      assert.equal(geometry?.key, 'geometry')
      assert.equal(geometry?.['x-capabilities']?.vtPrepare, true)
      assert.ok(!withVt.find(p => p.key === '_geoshape'), 'calculated fields are dropped by data-fair at upload')
      const withoutVt = getDatasetSchema('commune', { year: 2026, enableVtPrepare: false })
      assert.equal(withoutVt.find(p => p.key === 'geometry')?.['x-capabilities'], undefined)
    })
  })

  describe('dataset metadata', () => {
    const levels = ['region', 'departement', 'epci', 'commune', 'arrondissement-municipal', 'iris'] as const

    it('follows the data-fair guidelines for summaries and descriptions', () => {
      for (const level of levels) {
        for (const year of [2017, 2026]) {
          const meta = getDatasetMetadata(level, year, getSourceForLevel(year, level), { combineCommunesAndPlm: true })
          assert.ok(meta.summary.length >= 150 && meta.summary.length <= 300, `${level} ${year} summary length ${meta.summary.length}`)
          assert.ok(!/^ce jeu de données/i.test(meta.summary))
          assert.ok(!meta.summary.includes('\n'))
          assert.ok(meta.description.length >= 500 && meta.description.length <= 2000, `${level} ${year} description length ${meta.description.length}`)
          assert.ok(meta.description.startsWith('## '))
          assert.ok(meta.keywords.includes('contours'), 'applications look contours datasets up with q=contours')
          assert.deepEqual(meta.temporal, { start: `${year}-01-01`, end: `${year}-12-31` })
          assert.equal(meta.license.href, 'https://www.etalab.gouv.fr/licence-ouverte-open-licence')
        }
      }
    })

    it('records the versioned IGN product the dataset conforms to', () => {
      assert.deepEqual(getDatasetMetadata('commune', 2026, getSourceForLevel(2026, 'commune'), { combineCommunesAndPlm: true }).conformsTo, { title: 'ADMIN-EXPRESS-COG', version: '4.0', url: 'https://geoservices.ign.fr/adminexpress' })
      assert.equal(getDatasetMetadata('commune', 2017, getSourceForLevel(2017, 'commune'), { combineCommunesAndPlm: true }).conformsTo.version, '1.0')
      const iris = getDatasetMetadata('iris', 2022, getSourceForLevel(2022, 'iris'), { combineCommunesAndPlm: true })
      assert.deepEqual(iris.conformsTo, { title: 'CONTOURS-IRIS', version: '2.1', url: 'https://geoservices.ign.fr/contoursiris' })
      assert.equal(iris.creator, 'IGN et INSEE')
      assert.equal(iris.origin, 'https://geoservices.ign.fr/contoursiris')
    })

    it('uses each concept at most once per dataset and labels the coded columns', () => {
      for (const level of levels) {
        const schema = getDatasetSchema(level, { year: 2026, enableVtPrepare: true, combineCommunesAndPlm: true })
        const concepts = schema.map(p => p['x-refersTo']).filter(Boolean)
        assert.equal(new Set(concepts).size, concepts.length, `${level}: duplicated concept`)
        assert.ok(concepts.includes('http://www.w3.org/2000/01/rdf-schema#label') || concepts.includes('http://schema.org/City'), `${level}: no label column`)
        for (const prop of schema) {
          assert.ok(prop.title.split(' ').length <= 6, `${prop.key} title too long`)
          if (prop.description) assert.ok(!/^(le |la |les )?\w+ (de|du) /i.test(prop.description) || prop.description.length > 40, `${prop.key}: paraphrase description`)
        }
      }
      const typIris = getDatasetSchema('iris', { year: 2026 }).find(p => p.key === 'TYP_IRIS')
      assert.deepEqual(Object.keys(typIris?.['x-labels'] ?? {}), ['H', 'A', 'D', 'Z'])
    })
  })

  describe('normalization', () => {
    it('formats INSEE codes preserving leading zeros and Corsica codes', () => {
      assert.equal(formatInseeCode(1001, 5), '01001')
      assert.equal(formatInseeCode('1001', 5), '01001')
      assert.equal(formatInseeCode('2A004', 5), '2A004')
      assert.equal(formatInseeCode('97401', 5), '97401')
      assert.equal(formatInseeCode(1, 2), '01')
      assert.equal(formatInseeCode(null, 2), '')
    })

    it('enriches a commune (ADMIN-EXPRESS 3.x attributes) from the higher levels', () => {
      const memory = createTerritoryMemory()
      normalizeFeature({ geometry: null, properties: { INSEE_REG: '84', NOM: 'Auvergne-Rhône-Alpes', CHF_REG: '69123' } }, 'region', 2023, memory)
      normalizeFeature({ geometry: null, properties: { INSEE_DEP: '01', NOM: 'Ain', INSEE_REG: '84', CHF_DEP: '01053' } }, 'departement', 2023, memory)
      normalizeFeature({ geometry: null, properties: { CODE_SIREN: '200042497', NOM: 'CC de la Dombes', NATURE: 'CC' } }, 'epci', 2023, memory)
      const commune = normalizeFeature({
        geometry: { type: 'Point', coordinates: [4.9, 46.1] },
        properties: { INSEE_COM: '01001', NOM: "L'Abergement-Clémenciat", STATUT: 'Commune simple', POPULATION: 800, INSEE_CAN: '01', INSEE_ARR: '012', INSEE_DEP: '01', INSEE_REG: '84', SIREN_EPCI: '200042497' }
      }, 'commune', 2023, memory, { combineCommunesAndPlm: true, schemaKeys: keysOf('commune', 2023) })
      assert.equal(commune.id, 'com-2023-01001')
      assert.deepEqual(commune.properties, {
        niveau: 'commune', annee: 2023, NOM_COM: "L'Abergement-Clémenciat", INSEE_COM: '01001', STATUT: 'Commune simple', INSEE_ARR: '012', INSEE_CAN: '01', NOM_REG: 'Auvergne-Rhône-Alpes', INSEE_REG: '84', NOM_DEP: 'Ain', INSEE_DEP: '01', NOM_EPCI: 'CC de la Dombes', CODE_EPCI: '200042497', TYPE_EPCI: 'CC', POPULATION: 800, INSEE_RATT: ''
      })
    })

    it('reads the renamed ADMIN-EXPRESS-COG 4.0 attributes and the chef-lieu layers', async () => {
      const memory = createTerritoryMemory()
      const chefLieux = path.join(tmpDir, 'chef_lieu_de_region.geojson')
      await fs.writeFile(chefLieux, [
        '{', '"type": "FeatureCollection",', '"features": [',
        JSON.stringify({ type: 'Feature', properties: { code_insee_de_la_region: '94', code_insee_de_la_commune_siege: '2A004' }, geometry: null }) + ',',
        JSON.stringify({ type: 'Feature', properties: { code_insee_du_departement: '2A', code_insee_de_la_commune_siege: '2A004' }, geometry: null }),
        ']', '}'
      ].join('\n'))
      await loadChefLieux([chefLieux], memory)

      const region = normalizeFeature({ geometry: null, properties: { code_insee: '94', nom_officiel: 'Corse', code_siren: '200076958' } }, 'region', 2026, memory)
      assert.deepEqual(region.properties, { niveau: 'région', annee: 2026, NOM_REG: 'Corse', INSEE_REG: '94', CHF_REG: '2A004' })
      const dep = normalizeFeature({ geometry: null, properties: { code_insee: '2A', nom_officiel: 'Corse-du-Sud', code_insee_de_la_region: '94' } }, 'departement', 2026, memory)
      assert.deepEqual(dep.properties, { niveau: 'département', annee: 2026, NOM_DEP: 'Corse-du-Sud', INSEE_DEP: '2A', CHF_DEP: '2A004', NOM_REG: 'Corse', INSEE_REG: '94' })
      normalizeFeature({ geometry: null, properties: { code_siren: '242010056', nom_officiel: 'CA du Pays Ajaccien', nature: "Communauté d'agglomération" } }, 'epci', 2026, memory)
      const commune = normalizeFeature({
        geometry: null,
        properties: { code_insee: '2A004', nom_officiel: 'Ajaccio', statut: 'Préfecture de région', population: 76320, code_insee_du_canton: '2A98', code_insee_de_l_arrondissement: '2A1', code_insee_du_departement: '2A', code_insee_de_la_region: '94', code_siren: '212000046', codes_siren_des_epci: '242010056/200012345' }
      }, 'commune', 2026, memory, { combineCommunesAndPlm: true, schemaKeys: keysOf('commune') })
      assert.equal(commune.properties.CODE_EPCI, '242010056', 'first EPCI, never the commune SIREN')
      assert.equal(commune.properties.NOM_EPCI, 'CA du Pays Ajaccien')
      assert.equal(commune.properties.NOM_DEP, 'Corse-du-Sud')
      assert.equal(commune.properties.INSEE_CAN, '2A98')
      assert.equal(commune.properties.POPULATION, 76320)
      const iris = normalizeFeature({ geometry: null, properties: { code_insee: '2A004', nom_commune: 'Ajaccio', iris: '0101', code_iris: '2A0040101', nom_iris: 'Centre Ville 1', type_iris: 'H' } }, 'iris', 2026, memory)
      assert.deepEqual(iris.properties, { niveau: 'IRIS', annee: 2026, CODE_IRIS: '2A0040101', NOM_IRIS: 'Centre Ville 1', TYP_IRIS: 'H', NOM_COM: 'Ajaccio', INSEE_COM: '2A004' })
    })

    it('merges the arrondissements into the commune level in place of Paris, Lyon and Marseille', () => {
      const memory = createTerritoryMemory()
      memory.departments.set('75', { nomDep: 'Paris', chfDep: '75056', inseeReg: '11', nomReg: 'Île-de-France' })
      memory.regions.set('11', { nomReg: 'Île-de-France', chfReg: '75056' })
      memory.epci.set('200054781', { nomEpci: 'Métropole du Grand Paris', typeEpci: 'METRO' })
      const options = { combineCommunesAndPlm: true, schemaKeys: keysOf('commune') }

      const paris = normalizeFeature({ geometry: null, properties: { INSEE_COM: '75056', NOM: 'Paris', INSEE_DEP: '75', INSEE_REG: '11', SIREN_EPCI: '200054781' } }, 'commune', 2026, memory, options)
      assert.equal(paris, null)
      const arm = normalizeFeature({ geometry: null, properties: { INSEE_ARM: '75101', INSEE_COM: '75056', NOM: 'Paris 1er Arrondissement', POPULATION: 16000 } }, 'arrondissement-municipal', 2026, memory, options)
      assert.equal(arm.id, 'com-2026-75101')
      assert.deepEqual(arm.properties, {
        niveau: 'commune', annee: 2026, NOM_COM: 'Paris 1er Arrondissement', INSEE_COM: '75101', INSEE_RATT: '75056', NOM_REG: 'Île-de-France', INSEE_REG: '11', NOM_DEP: 'Paris', INSEE_DEP: '75', NOM_EPCI: 'Métropole du Grand Paris', CODE_EPCI: '200054781', TYPE_EPCI: 'METRO', POPULATION: 16000, STATUT: 'Arrondissement municipal', INSEE_ARR: '', INSEE_CAN: ''
      })
      assert.deepEqual([...keysOf('commune')].filter(k => k !== 'geometry').sort(), Object.keys(arm.properties).sort())
    })

    it('keeps the parent communes in the standalone mode but still remembers them for the arrondissements', () => {
      const memory = createTerritoryMemory()
      memory.epci.set('200046977', { nomEpci: 'Métropole de Lyon', typeEpci: 'METRO' })
      const options = { combineCommunesAndPlm: false, schemaKeys: keysOf('arrondissement-municipal', 2026, false) }
      const lyon = normalizeFeature({ geometry: null, properties: { code_insee: '69123', nom_officiel: 'Lyon', code_insee_du_departement: '69', code_insee_de_la_region: '84', codes_siren_des_epci: '200046977' } }, 'commune', 2026, memory, { combineCommunesAndPlm: false, schemaKeys: keysOf('commune', 2026, false) })
      assert.equal(lyon.properties.INSEE_COM, '69123')
      assert.equal(lyon.properties.INSEE_RATT, undefined)
      const arm = normalizeFeature({ geometry: null, properties: { code_insee: '69381', code_insee_de_la_commune_de_rattach: '69123', nom_officiel: 'Lyon 1er Arrondissement', population: 30000 } }, 'arrondissement-municipal', 2026, memory, options)
      assert.equal(arm.id, 'arm-2026-69381')
      assert.equal(arm.properties.niveau, 'arrondissement municipal')
      assert.equal(arm.properties.NOM_EPCI, 'Métropole de Lyon')
      assert.equal(arm.properties.STATUT, undefined)
    })

    it('rejects a feature without its pivot code', () => {
      const memory = createTerritoryMemory()
      assert.throws(() => normalizeFeature({ geometry: null, properties: { NOM: 'Nowhere' } }, 'commune', 2026, memory), /Code commune manquant/)
      assert.throws(() => normalizeFeature({ geometry: null, properties: { NOM_IRIS: 'x' } }, 'iris', 2026, memory), /Code IRIS manquant/)
    })

    it('writes a strictly schema-conformant GeoJSON file', async () => {
      const input = path.join(tmpDir, 'region.geojson')
      const output = path.join(tmpDir, 'region-normalized.geojson')
      await fs.writeFile(input, [
        '{', '"type": "FeatureCollection",', '"name": "REGION",', '"features": [',
        JSON.stringify({ type: 'Feature', properties: { ID: 'x', INSEE_REG: '84', NOM: 'Auvergne-Rhône-Alpes', NOM_M: 'AUVERGNE', CHF_REG: '69123' }, geometry: { type: 'Point', coordinates: [4.8, 45.7] } }) + ',',
        JSON.stringify({ type: 'Feature', properties: { ID: 'y', INSEE_REG: '11', NOM: 'Île-de-France', NOM_M: 'ILE', CHF_REG: '75056' }, geometry: { type: 'Point', coordinates: [2.3, 48.8] } }),
        ']', '}'
      ].join('\n'))
      const memory = createTerritoryMemory()
      const count = await normalizeGeojson({ paths: [input] }, output, 'region', 2023, memory, { schemaKeys: keysOf('region') }, log)
      assert.equal(count, 2)
      const features = []
      for await (const f of parseGeojsonFeatures(output)) features.push(f)
      assert.deepEqual(features.map(f => f.id), ['reg-2023-84', 'reg-2023-11'])
      assert.deepEqual(Object.keys(features[0].properties), ['niveau', 'annee', 'NOM_REG', 'INSEE_REG', 'CHF_REG'])
      assert.equal(memory.regions.get('11')?.nomReg, 'Île-de-France')
      assert.deepEqual(JSON.parse(await fs.readFile(output, 'utf8')).features.length, 2, 'the whole file is valid JSON')

      await assert.rejects(
        normalizeGeojson({ paths: [input] }, output, 'region', 2023, memory, { schemaKeys: keysOf('departement') }, log),
        /non conforme au schéma/
      )
      assert.ok(!await fs.pathExists(`${output}.tmp`))
    })
  })

  describe('archive extraction', () => {
    const buildArchive = async (): Promise<string> => {
      const srcDir = path.join(tmpDir, 'archive-src')
      await fs.outputFile(path.join(srcDir, 'delivery', 'hello.txt'), 'hello contours')
      const archivePath = path.join(tmpDir, 'delivery.7z')
      await fs.remove(archivePath)
      const { default: SevenZipFactory } = await import('7z-wasm')
      const factory: any = 'default' in SevenZipFactory ? SevenZipFactory.default : SevenZipFactory
      const sevenZip = await factory({ print: () => {}, printErr: () => {}, stdin: () => -1 })
      sevenZip.FS.mkdir('/w')
      sevenZip.FS.mount(sevenZip.NODEFS, { root: tmpDir }, '/w')
      sevenZip.FS.chdir('/w/archive-src')
      sevenZip.callMain(['a', '-y', '/w/delivery.7z', 'delivery'])
      assert.ok(await fs.pathExists(archivePath))
      return archivePath
    }

    it('extracts with 7z-wasm when no native binary is available', async () => {
      const archivePath = await buildArchive()
      const extractDir = path.join(tmpDir, 'extract-wasm')
      await fs.ensureDir(extractDir)
      assert.equal(await extract7z(archivePath, extractDir, 'wasm'), 'wasm')
      assert.equal(await fs.readFile(path.join(extractDir, 'delivery', 'hello.txt'), 'utf8'), 'hello contours')
    })

    it('prefers a native binary when there is one', { skip: !has7z && 'no 7z binary' }, async () => {
      const archivePath = await buildArchive()
      const extractDir = path.join(tmpDir, 'extract-native')
      await fs.ensureDir(extractDir)
      assert.equal(await extract7z(archivePath, extractDir), 'native')
      assert.equal(await fs.readFile(path.join(extractDir, 'delivery', 'hello.txt'), 'utf8'), 'hello contours')
    })
  })

  describe('GDAL conversion', { skip: !hasOgr2ogr && 'no ogr2ogr binary' }, () => {
    it('simplifies after reprojection, so the tolerance in degrees also applies to Lambert-93 sources', async () => {
      const extractDir = path.join(tmpDir, 'delivery-shp', 'ADE_1-0_SHP_LAMB93_FR')
      await fs.ensureDir(extractDir)
      const source = path.join(tmpDir, 'circle.geojson')
      await fs.writeJson(source, lambertCircle())
      await promisify(execFile)('ogr2ogr', ['-f', 'ESRI Shapefile', '-a_srs', 'EPSG:2154', path.join(extractDir, 'REGION.shp'), source])

      const converted = await convertLayer({ extractDir: path.dirname(extractDir), format: 'shp', layer: 'region', outputDir: path.join(tmpDir, 'geojson-simplified'), simplifyTolerance: 0.001, log })
      assert.equal(converted.length, 1)
      assert.equal(path.basename(converted[0]), 'region.geojson')
      const simplified = await fs.readJson(converted[0])
      const ring = simplified.features[0].geometry.coordinates[0]
      assert.ok(ring.length < 20, `expected a handful of vertices after simplification, got ${ring.length}`)
      assert.ok(ring.every(([lon, lat]: number[]) => lon > 2 && lon < 3 && lat > 48 && lat < 49), 'coordinates are WGS84 lon/lat')

      const full = await convertLayer({ extractDir: path.dirname(extractDir), format: 'shp', layer: 'region', outputDir: path.join(tmpDir, 'geojson-full'), simplifyTolerance: null, log })
      assert.equal((await fs.readJson(full[0])).features[0].geometry.coordinates[0].length, 401)
      assert.ok(!await fs.pathExists(`${converted[0]}.4326.gpkg`), 'the intermediate GeoPackage is removed')
    })

    it('tolerates a missing optional layer and fails on a missing mandatory one', async () => {
      const extractDir = path.join(tmpDir, 'delivery-shp')
      assert.deepEqual(await convertLayer({ extractDir, format: 'shp', layer: 'ARRONDISSEMENT_MUNICIPAL', outputDir: path.join(tmpDir, 'geojson-arm'), simplifyTolerance: null, optional: true, log }), [])
      await assert.rejects(convertLayer({ extractDir, format: 'shp', layer: 'COMMUNE', outputDir: path.join(tmpDir, 'geojson-com'), simplifyTolerance: null, log }), /COMMUNE introuvable/)
    })
  })

  describe('lifecycle (prepare, stop)', () => {
    beforeEach(() => { resetStopState() })

    it('prepare returns the config untouched (no secret)', async () => {
      const config = { years: [2026], levels: ['commune'] } as any
      const res = await plugin.prepare({ processingConfig: config, secrets: {} })
      assert.deepEqual(res.processingConfig, config)
    })

    it('stop flips the flag and kills the running external commands', async () => {
      assert.equal(isStopped(), false)
      const pending = runCommand('sleep', ['30'])
      await new Promise(resolve => setTimeout(resolve, 100))
      const started = Date.now()
      await plugin.stop()
      assert.equal(isStopped(), true)
      await assert.rejects(pending, StopError)
      assert.ok(Date.now() - started < 5000, 'the child did not wait for its natural end')
    })
  })
})
