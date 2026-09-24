import type { AdministrativeLevel } from './sources.ts'

export interface DatasetProperty {
  key: string
  title: string
  type: string
  /** Only when it says what the title cannot: a unit, a convention, what an empty value means */
  description?: string
  ignoreDetection?: boolean
  /** data-fair vocabulary concept (one column per concept and per dataset) */
  'x-refersTo'?: string
  'x-capabilities'?: Record<string, boolean>
  /** Human-readable labels of the coded values */
  'x-labels'?: Record<string, string>
}

const codeCapabilities = {
  insensitive: false,
  text: false,
  textStandard: false
}

const labelCapabilities = {
  textStandard: false
}

const NIVEAU: DatasetProperty = {
  key: 'niveau',
  title: 'Niveau administratif',
  type: 'string',
  'x-capabilities': codeCapabilities
}

const ANNEE: DatasetProperty = {
  key: 'annee',
  title: 'Millésime',
  type: 'integer',
  description: 'Année de l\'édition IGN, qui décrit la situation administrative au 1er janvier'
}

const INSEE_REG: DatasetProperty = {
  key: 'INSEE_REG',
  title: 'Code région',
  type: 'string',
  ignoreDetection: true,
  'x-refersTo': 'http://rdf.insee.fr/def/geo#codeRegion',
  'x-capabilities': codeCapabilities
}

const NOM_REG: DatasetProperty = {
  key: 'NOM_REG',
  title: 'Nom région',
  type: 'string',
  'x-refersTo': 'https://schema.org/addressRegion',
  'x-capabilities': labelCapabilities
}

const CHF_REG: DatasetProperty = {
  key: 'CHF_REG',
  title: 'Code chef-lieu région',
  type: 'string',
  description: 'Code INSEE de la commune siège du conseil régional (un arrondissement municipal pour Paris, Lyon et Marseille dans les éditions récentes)',
  ignoreDetection: true,
  'x-capabilities': codeCapabilities
}

const INSEE_DEP: DatasetProperty = {
  key: 'INSEE_DEP',
  title: 'Code département',
  type: 'string',
  ignoreDetection: true,
  'x-refersTo': 'http://rdf.insee.fr/def/geo#codeDepartement',
  'x-capabilities': codeCapabilities
}

const NOM_DEP: DatasetProperty = {
  key: 'NOM_DEP',
  title: 'Nom département',
  type: 'string',
  'x-refersTo': 'http://rdf.insee.fr/def/geo#Departement',
  'x-capabilities': labelCapabilities
}

const CHF_DEP: DatasetProperty = {
  key: 'CHF_DEP',
  title: 'Code chef-lieu département',
  type: 'string',
  description: 'Code INSEE de la commune siège du conseil départemental (un arrondissement municipal pour Paris, Lyon et Marseille dans les éditions récentes)',
  ignoreDetection: true,
  'x-capabilities': codeCapabilities
}

const TYPE_EPCI: DatasetProperty = {
  key: 'TYPE_EPCI',
  title: 'Nature EPCI',
  type: 'string',
  description: 'Nature juridique de l\'EPCI à fiscalité propre, telle que livrée par l\'IGN : abrégée jusqu\'au millésime 2024, en toutes lettres à partir de 2025',
  'x-capabilities': codeCapabilities,
  'x-labels': {
    CC: 'Communauté de communes',
    CA: 'Communauté d\'agglomération',
    CU: 'Communauté urbaine',
    ME: 'Métropole',
    METRO: 'Métropole',
    MET69: 'Métropole de Lyon',
    SAN: 'Syndicat d\'agglomération nouvelle'
  }
}

const NOM_EPCI: DatasetProperty = {
  key: 'NOM_EPCI',
  title: 'Nom EPCI',
  type: 'string',
  'x-capabilities': labelCapabilities
}

const CODE_EPCI: DatasetProperty = {
  key: 'CODE_EPCI',
  title: 'Code EPCI (SIREN)',
  type: 'string',
  description: 'Numéro SIREN de l\'EPCI à fiscalité propre ; vide pour une commune qui n\'en fait partie d\'aucun',
  ignoreDetection: true,
  'x-refersTo': 'http://rdf.insee.fr/def/geo#EtablissementPublicDeCooperationIntercommunale',
  'x-capabilities': codeCapabilities
}

const INSEE_COM: DatasetProperty = {
  key: 'INSEE_COM',
  title: 'Code commune / arrondissement',
  type: 'string',
  ignoreDetection: true,
  'x-refersTo': 'http://rdf.insee.fr/def/geo#codeCommune',
  'x-capabilities': codeCapabilities
}

const NOM_COM: DatasetProperty = {
  key: 'NOM_COM',
  title: 'Nom commune / arrondissement',
  type: 'string',
  'x-refersTo': 'http://schema.org/City',
  'x-capabilities': labelCapabilities
}

const INSEE_RATT: DatasetProperty = {
  key: 'INSEE_RATT',
  title: 'Code commune de rattachement',
  type: 'string',
  description: 'Code INSEE de Paris, Lyon ou Marseille pour un arrondissement municipal ; vide pour une commune',
  ignoreDetection: true,
  'x-capabilities': codeCapabilities
}

const POPULATION: DatasetProperty = {
  key: 'POPULATION',
  title: 'Population municipale',
  type: 'integer',
  description: 'Population municipale au sens de l\'INSEE, telle que reprise par l\'IGN dans l\'édition du millésime'
}

const STATUT: DatasetProperty = {
  key: 'STATUT',
  title: 'Statut administratif',
  type: 'string',
  'x-capabilities': codeCapabilities
}

const INSEE_ARR: DatasetProperty = {
  key: 'INSEE_ARR',
  title: 'Code arrondissement',
  type: 'string',
  description: 'Code INSEE complet de l\'arrondissement départemental : code du département suivi du numéro de l\'arrondissement',
  ignoreDetection: true,
  'x-capabilities': codeCapabilities
}

const INSEE_CAN: DatasetProperty = {
  key: 'INSEE_CAN',
  title: 'Code canton',
  type: 'string',
  description: 'Code INSEE complet du canton : code du département suivi du numéro du canton',
  ignoreDetection: true,
  'x-capabilities': codeCapabilities
}

const NOM_ARR: DatasetProperty = {
  key: 'NOM_ARR',
  title: 'Nom arrondissement',
  type: 'string',
  description: 'Absent de certaines livraisons de l\'IGN (2017, 2018, 2021) : repris d\'un millésime plus récent traité dans la même exécution, vide sinon',
  'x-capabilities': labelCapabilities
}

const NOM_CAN: DatasetProperty = {
  key: 'NOM_CAN',
  title: 'Nom canton',
  type: 'string',
  description: 'Livré par l\'IGN à partir de 2025 : repris d\'un millésime plus récent traité dans la même exécution, vide sinon',
  'x-capabilities': labelCapabilities
}

const CODE_IRIS: DatasetProperty = {
  key: 'CODE_IRIS',
  title: 'Code IRIS',
  type: 'string',
  ignoreDetection: true,
  'x-refersTo': 'http://rdf.insee.fr/def/geo#codeIRIS',
  'x-capabilities': codeCapabilities
}

const NOM_IRIS: DatasetProperty = {
  key: 'NOM_IRIS',
  title: 'Nom IRIS',
  type: 'string',
  'x-capabilities': labelCapabilities
}

const TYP_IRIS: DatasetProperty = {
  key: 'TYP_IRIS',
  title: 'Type IRIS',
  type: 'string',
  'x-capabilities': codeCapabilities,
  'x-labels': {
    H: 'Habitat',
    A: 'Activité',
    D: 'Divers',
    Z: 'Commune non découpée en IRIS'
  }
}

// For a GeoJSON file data-fair names the geometry column "geometry"; the vtPrepare capability
// declared on it is copied to the calculated _geoshape field and triggers the pre-computation
// of vector tiles at indexing time.
const GEOMETRY: DatasetProperty = {
  key: 'geometry',
  title: 'Géométrie',
  type: 'string',
  'x-refersTo': 'https://purl.org/geojson/vocab#geometry'
}

const GEOMETRY_VT: DatasetProperty = {
  ...GEOMETRY,
  'x-capabilities': { vtPrepare: true }
}

export const getDatasetSchema = (
  level: AdministrativeLevel,
  options: { year: number, enableVtPrepare?: boolean, combineCommunesAndPlm?: boolean }
): DatasetProperty[] => {
  let properties: DatasetProperty[] = []

  switch (level) {
    case 'region':
      properties = [NIVEAU, ANNEE, NOM_REG, INSEE_REG, CHF_REG]
      break
    case 'departement':
      properties = [NIVEAU, ANNEE, NOM_DEP, INSEE_DEP, CHF_DEP, NOM_REG, INSEE_REG]
      break
    case 'arrondissement':
      properties = [NIVEAU, ANNEE, NOM_ARR, INSEE_ARR, NOM_DEP, INSEE_DEP, NOM_REG, INSEE_REG]
      break
    case 'canton':
      properties = [NIVEAU, ANNEE, NOM_CAN, INSEE_CAN, NOM_DEP, INSEE_DEP, NOM_REG, INSEE_REG]
      break
    case 'epci':
      properties = [NIVEAU, ANNEE, NOM_EPCI, CODE_EPCI, TYPE_EPCI]
      break
    case 'commune': {
      properties = [
        NIVEAU, ANNEE, NOM_COM, INSEE_COM, STATUT, POPULATION,
        INSEE_ARR, INSEE_CAN, NOM_REG, INSEE_REG, NOM_DEP, INSEE_DEP,
        NOM_EPCI, CODE_EPCI, TYPE_EPCI
      ]
      if (options.combineCommunesAndPlm) {
        properties.push(INSEE_RATT)
      }
      if (options.year === 2017) {
        properties = properties.filter(p => p.key !== 'POPULATION')
      }
      break
    }
    case 'arrondissement-municipal':
      properties = [
        NIVEAU, ANNEE, NOM_COM, INSEE_COM, POPULATION, INSEE_RATT,
        NOM_REG, INSEE_REG, NOM_DEP, INSEE_DEP, NOM_EPCI, CODE_EPCI, TYPE_EPCI
      ]
      break
    case 'iris':
      properties = [NIVEAU, ANNEE, CODE_IRIS, NOM_IRIS, TYP_IRIS, NOM_COM, INSEE_COM]
      break
  }

  return [...properties, options.enableVtPrepare ? GEOMETRY_VT : GEOMETRY]
}
