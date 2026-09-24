import type { AdministrativeLevel, LevelSource } from './sources.ts'

/**
 * Dataset-level metadata (DCAT fields of data-fair). Written the way the data-fair assistants
 * expect them: a plain-text summary of 200-300 characters that opens on the subject, a markdown
 * description of 500-2000 characters, and nothing that goes stale as the data changes (no counts,
 * no value lists).
 */
export interface DatasetMetadata {
  summary: string
  description: string
  license: { title: string, href: string }
  origin: string
  creator: string
  keywords: string[]
  spatial: string
  temporal: { start: string, end: string }
  frequency: 'annual'
  conformsTo: { title: string, version: string, url: string }
}

// "lov2" entry of data-fair's standard licenses; the IGN open data are distributed under it
const LICENCE_OUVERTE = { title: 'Licence Ouverte / Open Licence version 2.0', href: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence' }

const ADMIN_EXPRESS_URL = 'https://geoservices.ign.fr/adminexpress'
const PRODUCTS: Record<string, { url: string, creator: string, geometry: string }> = {
  'ADMIN-EXPRESS-COG': { url: ADMIN_EXPRESS_URL, creator: 'IGN', geometry: 'Les géométries sont celles de la version non généralisée de la base, reprojetées en WGS84 (EPSG:4326) : adaptées à l\'analyse et aux grandes échelles, mais volumineuses.' },
  'ADMIN-EXPRESS-COG-CARTO': { url: ADMIN_EXPRESS_URL, creator: 'IGN', geometry: 'Les géométries sont généralisées par l\'IGN pour la cartographie, en conservant les limites communes entre territoires voisins, puis reprojetées en WGS84 (EPSG:4326).' },
  'ADMIN-EXPRESS-COG-CARTO-PE': { url: ADMIN_EXPRESS_URL, creator: 'IGN', geometry: 'Les géométries sont fortement généralisées par l\'IGN pour la cartographie à petite échelle (France entière), en conservant les limites communes entre territoires voisins, puis reprojetées en WGS84 (EPSG:4326).' },
  'CONTOURS-IRIS': { url: 'https://geoservices.ign.fr/contoursiris', creator: 'IGN et INSEE', geometry: 'Les géométries sont celles de la base, reprojetées en WGS84 (EPSG:4326).' }
}

const SUBJECTS: Record<AdministrativeLevel, { summary: string, content: string, keywords: string[] }> = {
  region: {
    summary: 'Contours des régions françaises',
    content: 'une région, avec son code INSEE, son nom et le code de la commune siège du conseil régional',
    keywords: ['régions']
  },
  departement: {
    summary: 'Contours des départements français',
    content: 'un département, avec son code INSEE, son nom, le code de la commune siège du conseil départemental et la région d\'appartenance',
    keywords: ['départements']
  },
  arrondissement: {
    summary: 'Contours des arrondissements départementaux français',
    content: 'un arrondissement départemental, circonscription administrative de l\'État, avec son code INSEE, son nom, le département et la région d\'appartenance',
    keywords: ['arrondissements']
  },
  canton: {
    summary: 'Contours des cantons français',
    content: 'un canton, circonscription d\'élection des conseillers départementaux, avec son code INSEE, son nom, le département et la région d\'appartenance',
    keywords: ['cantons']
  },
  epci: {
    summary: 'Contours des établissements publics de coopération intercommunale (EPCI) à fiscalité propre',
    content: 'un EPCI à fiscalité propre (communauté de communes, d\'agglomération, urbaine ou métropole), avec son numéro SIREN, son nom et sa nature juridique',
    keywords: ['EPCI', 'intercommunalités']
  },
  commune: {
    summary: 'Contours des communes françaises',
    content: 'une commune, avec son code INSEE, son nom, son statut, sa population municipale et ses rattachements au canton, à l\'arrondissement, au département, à la région et à l\'EPCI',
    keywords: ['communes']
  },
  'arrondissement-municipal': {
    summary: 'Contours des arrondissements municipaux de Paris, Lyon et Marseille',
    content: 'un arrondissement municipal, avec son code INSEE, son nom, sa population municipale et la commune de rattachement',
    keywords: ['arrondissements municipaux', 'Paris', 'Lyon', 'Marseille']
  },
  iris: {
    summary: 'Contours des IRIS (îlots regroupés pour l\'information statistique)',
    content: 'un IRIS, la maille infra-communale de diffusion statistique de l\'INSEE, avec son code, son nom, son type et la commune d\'appartenance',
    keywords: ['IRIS', 'statistiques infra-communales']
  }
}

/** ".../download/ADMIN-EXPRESS-COG-CARTO/..." → "ADMIN-EXPRESS-COG-CARTO" */
const productTitle = (archiveUrl: string): string => archiveUrl.match(/\/download\/([^/]+)\//)![1]

/** "ADMIN-EXPRESS-COG_4-0__GPKG_WGS84G_FRA_2026-01-01" → "4.0" */
const productVersion = (archiveUrl: string): string => archiveUrl.match(/_(\d+)-(\d+)__/)?.slice(1, 3).join('.') ?? ''

export const getDatasetMetadata = (level: AdministrativeLevel, year: number, source: LevelSource, options: { combineCommunesAndPlm: boolean }): DatasetMetadata => {
  const title = productTitle(source.archives[0].url)
  const product = { title, ...PRODUCTS[title] }
  const subject = SUBJECTS[level]
  const plm = level === 'commune' && options.combineCommunesAndPlm
  const version = productVersion(source.archives[0].url)

  const summary = `${subject.summary} au 1er janvier ${year}, d'après ${product.title} de l'IGN, en projection WGS84${plm ? ', où Paris, Lyon et Marseille sont représentées par leurs arrondissements municipaux' : ''}. Les codes sont conservés sous forme de texte pour permettre les jointures.`

  const description = [
    '## Vue d\'ensemble',
    '',
    `Découpage administratif de la France (métropole et outre-mer) au 1er janvier ${year}, issu de la base **${product.title}**${version ? ` version ${version}` : ''} publiée par l'IGN${level === 'iris' ? ' en coédition avec l\'INSEE' : ''}. Chaque ligne correspond à ${subject.content}.`,
    '',
    '## Contenu',
    '',
    `- ${product.geometry}`,
    '- Tous les codes (INSEE, SIREN) sont des chaînes de caractères : les zéros initiaux et les codes corses `2A`/`2B` sont préservés.',
    ...(level === 'commune' || level === 'arrondissement-municipal' || level === 'iris'
      ? ['- Les libellés de région, de département et d\'EPCI sont repris de l\'édition la plus récente traitée, afin d\'être homogènes d\'un millésime à l\'autre.']
      : []),
    ...(plm
      ? ['- Les communes de Paris, Lyon et Marseille sont remplacées par leurs arrondissements municipaux pour obtenir un découpage jointif sans superposition ; la colonne `INSEE_RATT` porte alors le code de la commune de rattachement.']
      : []),
    '',
    '## Notes d\'utilisation',
    '',
    `- Le millésime décrit la situation au 1er janvier ${year} ; les évolutions administratives intervenues après cette date n'y figurent pas.`,
    '- Les colonnes portant un code INSEE ou SIREN sont annotées avec les concepts correspondants, ce qui permet de les joindre à d\'autres jeux de données de la plateforme et de les cartographier.',
    `- Source : [${product.title}](${product.url}), diffusée sous Licence Ouverte 2.0.`
  ].join('\n')

  return {
    summary,
    description,
    license: LICENCE_OUVERTE,
    origin: product.url,
    creator: product.creator,
    keywords: ['contours', 'découpage administratif', 'IGN', product.title, String(year), ...subject.keywords],
    spatial: 'France (métropole et outre-mer)',
    temporal: { start: `${year}-01-01`, end: `${year}-12-31` },
    frequency: 'annual',
    conformsTo: { title: product.title, version, url: product.url }
  }
}
