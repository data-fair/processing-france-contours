import fs from 'fs-extra'
import readline from 'node:readline'
import type { ProcessingContext } from '@data-fair/lib-common-types/processings.js'
import type { ProcessingConfig } from '#types/processingConfig/index.ts'
import type { AdministrativeLevel } from './sources.ts'
import { assertNotStopped } from './state.ts'

type Log = ProcessingContext<ProcessingConfig>['log']
type Props = Record<string, any>

export interface TerritoryMemory {
  regions: Map<string, { nomReg: string, chfReg: string }>
  departments: Map<string, { nomDep: string, chfDep: string, inseeReg: string, nomReg: string }>
  epci: Map<string, { nomEpci: string, typeEpci: string }>
  /** Names of arrondissements and cantons, missing from some deliveries (ADMIN-EXPRESS 1.x and 3.x) */
  arrondissements: Map<string, string>
  cantons: Map<string, string>
  /** Paris, Marseille and Lyon, so that their arrondissements inherit the parent's territory info */
  parentCommunes: Map<string, { inseeDep: string, nomDep: string, inseeReg: string, nomReg: string, codeEpci: string, nomEpci: string, typeEpci: string }>
  /** ADMIN-EXPRESS 4.0 chef-lieu point layers, keyed by `reg:<code>` / `dep:<code>` */
  chefLieux: Map<string, string>
}

export interface NormalizeOptions {
  combineCommunesAndPlm?: boolean
  /** Do not drop Paris, Lyon and Marseille even in combined mode (no arrondissement layer in the delivery, 2017 to 2019) */
  keepPlmParents?: boolean
  /** Keys of the target dataset schema; when given, POPULATION is emitted only if the schema has it */
  schemaKeys?: Set<string>
}

export const createTerritoryMemory = (): TerritoryMemory => ({
  regions: new Map(),
  departments: new Map(),
  epci: new Map(),
  arrondissements: new Map(),
  cantons: new Map(),
  parentCommunes: new Map(),
  chefLieux: new Map()
})

export const formatInseeCode = (code: unknown, length = 5): string => {
  if (code === null || code === undefined) return ''
  const str = String(code).trim()
  if (/^\d+$/.test(str) && str.length < length) return str.padStart(length, '0')
  return str
}

/**
 * Attribute names changed with every ADMIN-EXPRESS major version (uppercase Shapefile columns
 * until 3.x, descriptive lowercase names in the 4.0 GeoPackage). Properties are indexed by
 * lowercase key once per feature and each field is looked up through an ordered list of aliases.
 */
const lowerProps = (raw: Props): Props => {
  const props: Props = {}
  for (const [key, value] of Object.entries(raw)) props[key.toLowerCase()] = value
  return props
}

const pick = (props: Props, aliases: string[]): unknown => {
  for (const alias of aliases) {
    const value = props[alias]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return undefined
}

// "non renseigné" / "non concerné" markers used by the IGN in code columns (Saint-Pierre-et-Miquelon, Paris cantons...)
const NOT_AVAILABLE = new Set(['NR', 'NC', 'ZZZZZZZZZ'])

const str = (props: Props, aliases: string[]): string => String(pick(props, aliases) ?? '').trim()
const code = (props: Props, aliases: string[], length = 0): string => {
  const value = formatInseeCode(pick(props, aliases), length)
  return NOT_AVAILABLE.has(value) ? '' : value
}
/**
 * Arrondissement and canton codes are delivered local to the département up to ADMIN-EXPRESS 3.x
 * ("2", "04") and complete from 4.0 ("012", "0104"): always return the complete INSEE code.
 */
export const departementalCode = (value: string, inseeDep: string): string =>
  !value || (value.length > inseeDep.length && value.startsWith(inseeDep)) ? value : inseeDep + value
const requireCode = (value: string, label: string, raw: Props): string => {
  if (!value) throw new Error(`Code ${label} manquant sur une entité : ${JSON.stringify(raw)}`)
  return value
}
const population = (props: Props): number | null => {
  const value = pick(props, ['population'])
  return value === undefined ? null : Number(value)
}

const F = {
  regCode: ['insee_reg', 'code_reg', 'code_insee'],
  regCodeOfChild: ['insee_reg', 'code_reg', 'code_insee_de_la_region'],
  regName: ['nom_reg', 'nom', 'nom_officiel'],
  regChefLieu: ['chf_reg', 'chf'],
  depCode: ['insee_dep', 'code_dep', 'code_insee'],
  depCodeOfChild: ['insee_dep', 'code_dep', 'code_insee_du_departement'],
  depName: ['nom_dep', 'nom', 'nom_officiel'],
  depChefLieu: ['chf_dep', 'chf'],
  epciCode: ['code_epci', 'code_siren', 'siren_epci'],
  epciCodeOfCommune: ['code_epci', 'siren_epci', 'codes_siren_des_epci'],
  epciName: ['nom_epci', 'nom', 'nom_officiel'],
  epciType: ['type_epci', 'nature'],
  comCode: ['insee_com', 'code_com', 'code_insee'],
  comName: ['nom_com', 'nom', 'nom_officiel'],
  comArr: ['insee_arr', 'code_insee_de_l_arrondissement'],
  comCan: ['insee_can', 'code_insee_du_canton'],
  arrCode: ['code_insee', 'insee_arr'],
  arrName: ['nom_officiel', 'nom_arr', 'nom'],
  canCode: ['code_insee', 'insee_can'],
  canName: ['nom_officiel', 'nom_can', 'nom'],
  armCode: ['insee_arm', 'code_insee'],
  armParent: ['code_insee_de_la_commune_de_rattach', 'insee_ratt', 'insee_com'],
  armName: ['nom_arm', 'nom_com', 'nom', 'nom_officiel'],
  irisCode: ['code_iris'],
  irisName: ['nom_iris'],
  irisType: ['typ_iris', 'type_iris'],
  irisComName: ['nom_com', 'nom_commune']
}

const PLM_PARENT_COMMUNES = new Set(['75056', '13055', '69123'])

/** First SIREN when the commune belongs to several EPCI (slash-separated in the source) */
const communeEpci = (props: Props): string => {
  const value = str(props, F.epciCodeOfCommune).split('/')[0]
  return NOT_AVAILABLE.has(value) ? '' : formatInseeCode(value, 9)
}

/**
 * Streams the features of a GeoJSON file one by one. GDAL writes one feature per line, which is
 * what this relies on (with a buffered fallback for multi-line features).
 */
export async function * parseGeojsonFeatures (filePath: string): AsyncGenerator<any> {
  const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' })
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity })
  let buffer = ''
  let inFeatures = false
  try {
    for await (const line of rl) {
      assertNotStopped()
      const trimmed = line.trim()
      if (!inFeatures) {
        if (trimmed.includes('"features"') && trimmed.endsWith('[')) inFeatures = true
        continue
      }
      if (trimmed === ']' || trimmed === ']}' || trimmed === '}') break
      if (!trimmed) continue
      buffer += line
      const candidate = buffer.trim().replace(/,$/, '')
      if (candidate.startsWith('{') && candidate.endsWith('}')) {
        try {
          const feature = JSON.parse(candidate)
          buffer = ''
          yield feature
        } catch {
          buffer += '\n'
        }
      }
    }
  } finally {
    rl.close()
    fileStream.destroy()
  }
}

/** Indexes the ADMIN-EXPRESS 4.0 chef-lieu point layers (region or departement code → commune code) */
export const loadChefLieux = async (paths: string[], memory: TerritoryMemory): Promise<void> => {
  for (const filePath of paths) {
    for await (const feature of parseGeojsonFeatures(filePath)) {
      const props = lowerProps(feature.properties ?? {})
      const commune = code(props, ['code_insee_de_la_commune_siege'], 5)
      const reg = code(props, ['code_insee_de_la_region'], 2)
      const dep = code(props, ['code_insee_du_departement'], 2)
      if (reg && commune) memory.chefLieux.set(`reg:${reg}`, commune)
      if (dep && commune) memory.chefLieux.set(`dep:${dep}`, commune)
    }
  }
}

/**
 * Normalizes one source feature into the target model of its level, enriching it from (and
 * feeding) the territory memory. Returns null for a feature that must be dropped.
 */
export const normalizeFeature = (
  feature: any,
  level: AdministrativeLevel,
  year: number,
  memory: TerritoryMemory,
  options: NormalizeOptions = {}
): any | null => {
  const raw: Props = feature.properties ?? {}
  const props = lowerProps(raw)
  const withPopulation = options.schemaKeys ? options.schemaKeys.has('POPULATION') : population(props) !== null
  const build = (id: string, properties: Props) => ({ id, type: 'Feature', geometry: feature.geometry, properties })

  switch (level) {
    // Years are processed from the most recent one: region and departement labels seen first
    // (mixed-case names, chef-lieu) complete the older deliveries where they are uppercase or absent
    case 'region': {
      const inseeReg = requireCode(code(props, F.regCode, 2), 'région', raw)
      const known = memory.regions.get(inseeReg)
      const nomReg = known?.nomReg || str(props, F.regName)
      const chfReg = known?.chfReg || code(props, F.regChefLieu, 5) || memory.chefLieux.get(`reg:${inseeReg}`) || ''
      memory.regions.set(inseeReg, { nomReg, chfReg })
      return build(`reg-${year}-${inseeReg}`, { niveau: 'région', annee: year, NOM_REG: nomReg, INSEE_REG: inseeReg, CHF_REG: chfReg })
    }

    case 'departement': {
      const inseeDep = requireCode(code(props, F.depCode, 2), 'département', raw)
      const inseeReg = code(props, F.regCodeOfChild, 2)
      const known = memory.departments.get(inseeDep)
      const nomDep = known?.nomDep || str(props, F.depName)
      const chfDep = known?.chfDep || code(props, F.depChefLieu, 5) || memory.chefLieux.get(`dep:${inseeDep}`) || ''
      const nomReg = memory.regions.get(inseeReg)?.nomReg || str(props, ['nom_reg'])
      memory.departments.set(inseeDep, { nomDep, chfDep, inseeReg, nomReg })
      return build(`dep-${year}-${inseeDep}`, {
        niveau: 'département', annee: year, NOM_DEP: nomDep, INSEE_DEP: inseeDep, CHF_DEP: chfDep, NOM_REG: nomReg, INSEE_REG: inseeReg
      })
    }

    case 'arrondissement':
    case 'canton': {
      const isArr = level === 'arrondissement'
      const inseeDep = code(props, F.depCodeOfChild, 2)
      const codeAliases = isArr ? F.arrCode : F.canCode
      // the IGN delivers the Métropole de Lyon as a canton with every code "NR": not a real canton
      if (NOT_AVAILABLE.has(str(props, codeAliases))) return null
      const localCode = code(props, codeAliases)
      const fullCode = requireCode(departementalCode(localCode, inseeDep), level, raw)
      const names = isArr ? memory.arrondissements : memory.cantons
      const name = str(props, isArr ? F.arrName : F.canName) || names.get(fullCode) || ''
      if (name) names.set(fullCode, name)
      const depInfo = memory.departments.get(inseeDep)
      const inseeReg = code(props, F.regCodeOfChild, 2) || depInfo?.inseeReg || ''
      const territory = {
        NOM_DEP: depInfo?.nomDep ?? '',
        INSEE_DEP: inseeDep,
        NOM_REG: memory.regions.get(inseeReg)?.nomReg || depInfo?.nomReg || '',
        INSEE_REG: inseeReg
      }
      return isArr
        ? build(`arr-${year}-${fullCode}`, { niveau: 'arrondissement', annee: year, NOM_ARR: name, INSEE_ARR: fullCode, ...territory })
        : build(`can-${year}-${fullCode}`, { niveau: 'canton', annee: year, NOM_CAN: name, INSEE_CAN: fullCode, ...territory })
    }

    case 'epci': {
      const codeEpci = requireCode(code(props, F.epciCode, 9), 'EPCI', raw)
      const nomEpci = str(props, F.epciName)
      const typeEpci = str(props, F.epciType)
      memory.epci.set(codeEpci, { nomEpci, typeEpci })
      return build(`epci-${year}-${codeEpci}`, { niveau: 'EPCI', annee: year, NOM_EPCI: nomEpci, CODE_EPCI: codeEpci, TYPE_EPCI: typeEpci })
    }

    case 'commune': {
      const inseeCom = requireCode(code(props, F.comCode, 5), 'commune', raw)
      const inseeDep = code(props, F.depCodeOfChild, 2)
      const inseeReg = code(props, F.regCodeOfChild, 2)
      const codeEpci = communeEpci(props)
      const depInfo = memory.departments.get(inseeDep)
      const regInfo = memory.regions.get(inseeReg)
      const epciInfo = codeEpci ? memory.epci.get(codeEpci) : undefined
      const territory = {
        inseeDep,
        nomDep: depInfo?.nomDep ?? str(props, ['nom_dep']),
        inseeReg,
        nomReg: regInfo?.nomReg ?? depInfo?.nomReg ?? str(props, ['nom_reg']),
        codeEpci,
        nomEpci: epciInfo?.nomEpci ?? str(props, ['nom_epci']),
        typeEpci: epciInfo?.typeEpci ?? str(props, ['type_epci'])
      }

      if (PLM_PARENT_COMMUNES.has(inseeCom)) {
        // remembered in both modes: the standalone arrondissement-municipal level needs it too
        memory.parentCommunes.set(inseeCom, territory)
        // the parent polygon overlaps its arrondissements, drop it when they are merged in
        if (options.combineCommunesAndPlm && !options.keepPlmParents) return null
      }

      const properties: Props = {
        niveau: 'commune',
        annee: year,
        NOM_COM: str(props, F.comName),
        INSEE_COM: inseeCom,
        STATUT: str(props, ['statut']),
        INSEE_ARR: departementalCode(code(props, F.comArr), inseeDep),
        INSEE_CAN: departementalCode(code(props, F.comCan), inseeDep),
        NOM_REG: territory.nomReg,
        INSEE_REG: inseeReg,
        NOM_DEP: territory.nomDep,
        INSEE_DEP: inseeDep,
        NOM_EPCI: territory.nomEpci,
        CODE_EPCI: codeEpci,
        TYPE_EPCI: territory.typeEpci
      }
      if (withPopulation) properties.POPULATION = population(props)
      if (options.combineCommunesAndPlm) properties.INSEE_RATT = ''
      return build(`com-${year}-${inseeCom}`, properties)
    }

    case 'arrondissement-municipal': {
      // ADMIN-EXPRESS 2.x stores the arrondissement code in INSEE_COM and the parent in INSEE_RATT
      const inseeArm = requireCode(code(props, F.armCode, 5) || (props.insee_ratt ? code(props, ['insee_com'], 5) : ''), 'arrondissement municipal', raw)
      const inseeRatt = code(props, F.armParent, 5)
      const parent = memory.parentCommunes.get(inseeRatt)
      const inseeDep = parent?.inseeDep || inseeArm.slice(0, 2)
      const depInfo = memory.departments.get(inseeDep)
      const inseeReg = parent?.inseeReg || depInfo?.inseeReg || ''
      const merged = options.combineCommunesAndPlm === true

      const properties: Props = {
        niveau: merged ? 'commune' : 'arrondissement municipal',
        annee: year,
        NOM_COM: str(props, F.armName),
        INSEE_COM: inseeArm,
        INSEE_RATT: inseeRatt,
        NOM_REG: parent?.nomReg || memory.regions.get(inseeReg)?.nomReg || '',
        INSEE_REG: inseeReg,
        NOM_DEP: parent?.nomDep || depInfo?.nomDep || '',
        INSEE_DEP: inseeDep,
        NOM_EPCI: parent?.nomEpci ?? '',
        CODE_EPCI: parent?.codeEpci ?? '',
        TYPE_EPCI: parent?.typeEpci ?? ''
      }
      if (withPopulation) properties.POPULATION = population(props)
      if (merged) {
        properties.STATUT = 'Arrondissement municipal'
        properties.INSEE_ARR = ''
        properties.INSEE_CAN = ''
      }
      return build(`${merged ? 'com' : 'arm'}-${year}-${inseeArm}`, properties)
    }

    case 'iris': {
      const codeIris = requireCode(code(props, F.irisCode, 9), 'IRIS', raw)
      return build(`iris-${year}-${codeIris}`, {
        niveau: 'IRIS',
        annee: year,
        CODE_IRIS: codeIris,
        NOM_IRIS: str(props, F.irisName),
        TYP_IRIS: str(props, F.irisType),
        NOM_COM: str(props, F.irisComName),
        INSEE_COM: code(props, F.comCode, 5)
      })
    }
  }
}

/** Every feature must carry exactly the columns of the dataset schema (the geometry is not a property) */
const validateProperties = (feature: any, schemaKeys: Set<string>): void => {
  const expected = [...schemaKeys].filter(k => k !== 'geometry')
  const actual = Object.keys(feature.properties)
  const missing = expected.filter(k => !(k in feature.properties))
  const extra = actual.filter(k => !schemaKeys.has(k))
  if (missing.length || extra.length) {
    throw new Error(`Entité ${feature.id} non conforme au schéma (manquant : [${missing}], en trop : [${extra}])`)
  }
}

export interface NormalizeInput {
  /** Converted GeoJSON files of the level's layer */
  paths: string[]
  /** Converted arrondissement-municipal files, merged into the commune level when combineCommunesAndPlm is on */
  armPaths?: string[]
}

/**
 * Writes the normalized features of one level to a single GeoJSON file and returns their count.
 */
export const normalizeGeojson = async (
  input: NormalizeInput,
  outputPath: string,
  level: AdministrativeLevel,
  year: number,
  memory: TerritoryMemory,
  options: NormalizeOptions & { schemaKeys: Set<string> },
  log: Log
): Promise<number> => {
  const tmpOutputPath = `${outputPath}.tmp`
  const writeStream = fs.createWriteStream(tmpOutputPath, { encoding: 'utf8' })
  let count = 0

  const write = (chunk: string) => new Promise<void>((resolve, reject) => {
    writeStream.write(chunk, err => err ? reject(err) : resolve())
  })
  const writeFeature = async (feature: any) => {
    validateProperties(feature, options.schemaKeys)
    await write(`${count === 0 ? '' : ',\n'}${JSON.stringify(feature)}`)
    count++
  }

  try {
    await write('{"type":"FeatureCollection","features":[\n')
    for (const filePath of input.paths) {
      for await (const raw of parseGeojsonFeatures(filePath)) {
        const feature = normalizeFeature(raw, level, year, memory, options)
        if (feature) await writeFeature(feature)
      }
    }
    if (level === 'commune' && options.combineCommunesAndPlm && input.armPaths?.length) {
      for (const filePath of input.armPaths) {
        for await (const raw of parseGeojsonFeatures(filePath)) {
          const feature = normalizeFeature(raw, 'arrondissement-municipal', year, memory, options)
          if (feature) await writeFeature(feature)
        }
      }
    }
    await write('\n]}\n')
    await new Promise<void>((resolve, reject) => writeStream.end((err?: Error) => err ? reject(err) : resolve()))
    await fs.move(tmpOutputPath, outputPath, { overwrite: true })
  } catch (err) {
    writeStream.destroy()
    await fs.remove(tmpOutputPath).catch(() => {})
    throw err
  }

  return count
}
