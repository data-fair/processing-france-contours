export type AdministrativeLevel = 'region' | 'departement' | 'arrondissement' | 'canton' | 'epci' | 'commune' | 'arrondissement-municipal' | 'iris'

/**
 * Geometric detail of a dataset. Each one is a distinct IGN product: the processing never
 * simplifies by itself (a per-polygon simplification opens gaps and overlaps between neighbours,
 * the IGN generalization keeps the shared boundaries).
 */
export type SimplifyLevel = 'full' | 'carto' | 'carto-pe'

export const SIMPLIFY_LEVELS: SimplifyLevel[] = ['full', 'carto', 'carto-pe']

export type ArchiveFormat = 'gpkg' | 'shp'

export interface Archive {
  url: string
  format: ArchiveFormat
}

export interface LevelSource {
  /** One archive for most millésimes, one per territory for CONTOURS-IRIS 2024-2025 and CARTO-PE 2024 */
  archives: Archive[]
  /** GeoPackage layer name or Shapefile basename, matched case-insensitively */
  layer: string
  /**
   * ADMIN-EXPRESS-COG 4.0 (GeoPackage) no longer stores the chef-lieu on the region/departement
   * polygons: it lives in a separate point layer, joined by the region/departement code.
   */
  chefLieuLayer?: string
}

const GEOPF = 'https://data.geopf.fr/telechargement/download'

/** ('ADMIN-EXPRESS-COG', '4-0__GPKG_WGS84G_FRA_2026-01-01') → its Géoplateforme archive */
const archive = (product: string, edition: string): Archive => {
  const name = `${product}_${edition}`
  return { url: `${GEOPF}/${product}/${name}/${name}.7z`, format: edition.includes('__GPKG_') ? 'gpkg' : 'shp' }
}
const oneArchivePerYear = (product: string, editions: Record<number, string>): Record<number, Archive[]> =>
  Object.fromEntries(Object.entries(editions).map(([year, edition]) => [year, [archive(product, edition)]]))

// ADMIN-EXPRESS-COG and ADMIN-EXPRESS-COG-CARTO share their edition names; CARTO starts in 2021
const CARTO_EDITIONS: Record<number, string> = {
  2026: '4-0__GPKG_WGS84G_FRA_2026-01-01',
  2025: '4-0__GPKG_WGS84G_FRA_2025-01-01',
  2024: '3-2__SHP_WGS84G_FRA_2024-02-22',
  2023: '3-2__SHP_WGS84G_FRA_2023-05-03',
  2022: '3-1__SHP_WGS84G_FRA_2022-04-15',
  2021: '3-0__SHP_WGS84G_FRA_2021-05-19'
}

// CARTO-PE 2024 is only delivered per territory: metropolitan France in Lambert-93, each DOM in UTM
const CARTO_PE_2024_TERRITORIES = ['LAMB93_FXX', 'RGAF09UTM20_D971', 'RGAF09UTM20_D972', 'UTM22RGFG95_D973', 'RGR92UTM40S_D974', 'RGM04UTM38S_D976']

export const ADMIN_EXPRESS_ARCHIVES: Record<SimplifyLevel, Record<number, Archive[]>> = {
  full: oneArchivePerYear('ADMIN-EXPRESS-COG', {
    ...CARTO_EDITIONS,
    2020: '2-1__SHP__FRA_2020-11-20',
    2019: '2-0__SHP__FRA_2019-09-24',
    2018: '1-1__SHP__FRA_2018-04-03',
    2017: '1-0__SHP__FRA_2017-06-19'
  }),
  carto: oneArchivePerYear('ADMIN-EXPRESS-COG-CARTO', CARTO_EDITIONS),
  'carto-pe': {
    ...oneArchivePerYear('ADMIN-EXPRESS-COG-CARTO-PE', {
      2026: '4-0__GPKG_WGS84G_FRA_2026-01-01',
      2025: '4-0__GPKG_WGS84G_FRA_2025-01-01'
    }),
    2024: CARTO_PE_2024_TERRITORIES.map(t => archive('ADMIN-EXPRESS-COG-CARTO-PE', `3-1__SHP_${t}_2024-04-15`))
  }
}

// Since 2024 CONTOURS-IRIS is delivered per territory (metropolitan France + each overseas
// territory), a single "FRA" archive only came back with the 2026 edition.
const IRIS_TERRITORIES = [
  'LAMB93_FXX', 'RGAF09UTM20_GLP', 'RGAF09UTM20_MTQ', 'UTM22RGFG95_GUF', 'RGR92UTM40S_REU',
  'RGM04UTM38S_MYT', 'RGSPM06U21_SPM', 'RGAF09UTM20_BLM', 'RGAF09UTM20_MAF'
]
const irisByTerritory = (year: number): Archive[] =>
  IRIS_TERRITORIES.map(t => archive('CONTOURS-IRIS', `3-0__GPKG_${t}_${year}-01-01`))

/** CONTOURS-IRIS has no generalized edition: IRIS datasets are only produced in `full` */
export const IRIS_ARCHIVES: Record<number, Archive[]> = {
  ...oneArchivePerYear('CONTOURS-IRIS', {
    2026: '3-0__GPKG_WGS84G_FRA_2026-01-01',
    2023: '3-0__SHP__FRA_2023-01-01',
    2022: '2-1__SHP__FRA_2022-01-01',
    2021: '2-1__SHP__FRA_2021-01-01',
    2020: '2-1__SHP__FRA_2020-01-01',
    2019: '2-1__SHP__FRA_2019-01-01',
    2018: '2-1__SHP__FRA_2018-01-01',
    2017: '2-1__SHP__FRA_2017-01-01'
  }),
  2025: irisByTerritory(2025),
  2024: irisByTerritory(2024)
}

export const YEARS = Object.keys(ADMIN_EXPRESS_ARCHIVES.full).map(Number).sort((a, b) => b - a)

// Shapefile basenames (v1 to v3) and GeoPackage layer names (v4) only differ by case
const ADMIN_EXPRESS_LAYERS: Record<Exclude<AdministrativeLevel, 'iris'>, string> = {
  region: 'REGION',
  departement: 'DEPARTEMENT',
  arrondissement: 'ARRONDISSEMENT',
  canton: 'CANTON',
  epci: 'EPCI',
  commune: 'COMMUNE',
  'arrondissement-municipal': 'ARRONDISSEMENT_MUNICIPAL'
}

/** The CANTON and ARRONDISSEMENT_MUNICIPAL layers only exist from ADMIN-EXPRESS-COG 2.1 (millésime 2020) */
export const FIRST_CANTON_AND_ARM_YEAR = 2020

/** Whether the IGN publishes this level for this millésime in this geometric detail */
export const isLevelAvailable = (year: number, level: AdministrativeLevel, simplifyLevel: SimplifyLevel): boolean => {
  if (level === 'iris') return simplifyLevel === 'full' && !!IRIS_ARCHIVES[year]
  if (!ADMIN_EXPRESS_ARCHIVES[simplifyLevel][year]) return false
  if (level === 'canton') return year >= FIRST_CANTON_AND_ARM_YEAR
  // CARTO-PE 3.1 (2024) has no ARRONDISSEMENT_MUNICIPAL layer
  if (level === 'arrondissement-municipal') return year >= FIRST_CANTON_AND_ARM_YEAR && !(simplifyLevel === 'carto-pe' && year < 2025)
  return true
}

// ADMIN-EXPRESS-COG 1.x and 2.x name the arrondissement layer ARRONDISSEMENT_DEPARTEMENTAL
const adminExpressLayer = (year: number, level: Exclude<AdministrativeLevel, 'iris'>): string =>
  level === 'arrondissement' && year <= 2020 ? 'ARRONDISSEMENT_DEPARTEMENTAL' : ADMIN_EXPRESS_LAYERS[level]

const CHEF_LIEU_LAYERS: Partial<Record<AdministrativeLevel, string>> = {
  region: 'chef_lieu_de_region',
  departement: 'chef_lieu_de_departement'
}

export const getSourceForLevel = (year: number, level: AdministrativeLevel, simplifyLevel: SimplifyLevel = 'full'): LevelSource => {
  if (!isLevelAvailable(year, level, simplifyLevel)) throw new Error(`No ${level} source is published by the IGN for ${year} in ${simplifyLevel}`)
  if (level === 'iris') {
    const archives = IRIS_ARCHIVES[year]
    return { archives, layer: archives[0].format === 'shp' ? 'CONTOURS-IRIS' : 'contours_iris' }
  }
  const archives = ADMIN_EXPRESS_ARCHIVES[simplifyLevel][year]
  return {
    archives,
    layer: adminExpressLayer(year, level),
    chefLieuLayer: archives[0].format === 'gpkg' ? CHEF_LIEU_LAYERS[level] : undefined
  }
}
