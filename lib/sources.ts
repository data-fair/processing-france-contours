export type AdministrativeLevel = 'region' | 'departement' | 'arrondissement' | 'canton' | 'epci' | 'commune' | 'arrondissement-municipal' | 'iris'

export type SimplifyLevel = 'full' | 'medium' | 'simple'

export type ArchiveFormat = 'gpkg' | 'shp'

export interface Archive {
  url: string
  format: ArchiveFormat
}

export interface LevelSource {
  /** One archive for most millésimes, one per territory for CONTOURS-IRIS 2024 and 2025 */
  archives: Archive[]
  /** GeoPackage layer name or Shapefile basename, matched case-insensitively */
  layer: string
  /**
   * ADMIN-EXPRESS-COG 4.0 (GeoPackage) no longer stores the chef-lieu on the region/departement
   * polygons: it lives in a separate point layer, joined by the region/departement code.
   */
  chefLieuLayer?: string
}

/** Tolerance in degrees (applied after reprojection to EPSG:4326) */
export const SIMPLIFY_TOLERANCES: Record<SimplifyLevel, number | null> = {
  full: null,
  medium: 0.001,
  simple: 0.01
}

const GEOPF = 'https://data.geopf.fr/telechargement/download'

const adminExpress = (name: string, format: ArchiveFormat): Archive => ({
  url: `${GEOPF}/ADMIN-EXPRESS-COG/${name}/${name}.7z`,
  format
})

const iris = (name: string, format: ArchiveFormat): Archive => ({
  url: `${GEOPF}/CONTOURS-IRIS/${name}/${name}.7z`,
  format
})

// Since 2024 CONTOURS-IRIS is delivered per territory (metropolitan France + each overseas
// territory), a single "FRA" archive only came back with the 2026 edition.
const IRIS_TERRITORIES = [
  'LAMB93_FXX', 'RGAF09UTM20_GLP', 'RGAF09UTM20_MTQ', 'UTM22RGFG95_GUF', 'RGR92UTM40S_REU',
  'RGM04UTM38S_MYT', 'RGSPM06U21_SPM', 'RGAF09UTM20_BLM', 'RGAF09UTM20_MAF'
]
const irisByTerritory = (year: number): Archive[] =>
  IRIS_TERRITORIES.map(t => iris(`CONTOURS-IRIS_3-0__GPKG_${t}_${year}-01-01`, 'gpkg'))

export const ADMIN_EXPRESS_ARCHIVES: Record<number, Archive> = {
  2026: adminExpress('ADMIN-EXPRESS-COG_4-0__GPKG_WGS84G_FRA_2026-01-01', 'gpkg'),
  2025: adminExpress('ADMIN-EXPRESS-COG_4-0__GPKG_WGS84G_FRA_2025-01-01', 'gpkg'),
  2024: adminExpress('ADMIN-EXPRESS-COG_3-2__SHP_WGS84G_FRA_2024-02-22', 'shp'),
  2023: adminExpress('ADMIN-EXPRESS-COG_3-2__SHP_WGS84G_FRA_2023-05-03', 'shp'),
  2022: adminExpress('ADMIN-EXPRESS-COG_3-1__SHP_WGS84G_FRA_2022-04-15', 'shp'),
  2021: adminExpress('ADMIN-EXPRESS-COG_3-0__SHP_WGS84G_FRA_2021-05-19', 'shp'),
  2020: adminExpress('ADMIN-EXPRESS-COG_2-1__SHP__FRA_2020-11-20', 'shp'),
  2019: adminExpress('ADMIN-EXPRESS-COG_2-0__SHP__FRA_2019-09-24', 'shp'),
  2018: adminExpress('ADMIN-EXPRESS-COG_1-1__SHP__FRA_2018-04-03', 'shp'),
  2017: adminExpress('ADMIN-EXPRESS-COG_1-0__SHP__FRA_2017-06-19', 'shp')
}

export const IRIS_ARCHIVES: Record<number, Archive[]> = {
  2026: [iris('CONTOURS-IRIS_3-0__GPKG_WGS84G_FRA_2026-01-01', 'gpkg')],
  2025: irisByTerritory(2025),
  2024: irisByTerritory(2024),
  2023: [iris('CONTOURS-IRIS_3-0__SHP__FRA_2023-01-01', 'shp')],
  2022: [iris('CONTOURS-IRIS_2-1__SHP__FRA_2022-01-01', 'shp')],
  2021: [iris('CONTOURS-IRIS_2-1__SHP__FRA_2021-01-01', 'shp')],
  2020: [iris('CONTOURS-IRIS_2-1__SHP__FRA_2020-01-01', 'shp')],
  2019: [iris('CONTOURS-IRIS_2-1__SHP__FRA_2019-01-01', 'shp')],
  2018: [iris('CONTOURS-IRIS_2-1__SHP__FRA_2018-01-01', 'shp')],
  2017: [iris('CONTOURS-IRIS_2-1__SHP__FRA_2017-01-01', 'shp')]
}

export const YEARS = Object.keys(ADMIN_EXPRESS_ARCHIVES).map(Number).sort((a, b) => b - a)

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

export const isLevelAvailable = (year: number, level: AdministrativeLevel): boolean =>
  !['canton', 'arrondissement-municipal'].includes(level) || year >= FIRST_CANTON_AND_ARM_YEAR

// ADMIN-EXPRESS-COG 1.x and 2.x name the arrondissement layer ARRONDISSEMENT_DEPARTEMENTAL
const adminExpressLayer = (year: number, level: Exclude<AdministrativeLevel, 'iris'>): string =>
  level === 'arrondissement' && year <= 2020 ? 'ARRONDISSEMENT_DEPARTEMENTAL' : ADMIN_EXPRESS_LAYERS[level]

const CHEF_LIEU_LAYERS: Partial<Record<AdministrativeLevel, string>> = {
  region: 'chef_lieu_de_region',
  departement: 'chef_lieu_de_departement'
}

export const getSourceForLevel = (year: number, level: AdministrativeLevel): LevelSource => {
  if (level === 'iris') {
    const archives = IRIS_ARCHIVES[year]
    if (!archives) throw new Error(`No CONTOURS-IRIS source is known for ${year}`)
    return { archives, layer: archives[0].format === 'shp' ? 'CONTOURS-IRIS' : 'contours_iris' }
  }
  const archive = ADMIN_EXPRESS_ARCHIVES[year]
  if (!archive) throw new Error(`No ADMIN-EXPRESS-COG source is known for ${year}`)
  if (!isLevelAvailable(year, level)) throw new Error(`No ${level} layer in ADMIN-EXPRESS-COG ${year}`)
  return {
    archives: [archive],
    layer: adminExpressLayer(year, level),
    chefLieuLayer: archive.format === 'gpkg' ? CHEF_LIEU_LAYERS[level] : undefined
  }
}
