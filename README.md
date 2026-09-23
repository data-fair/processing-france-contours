# @data-fair/processing-france-contours

Processing plugin for [data-fair/processings](https://github.com/data-fair/processings) that publishes and keeps up to date the official French administrative boundaries (IGN ADMIN-EXPRESS-COG and CONTOURS-IRIS), one dataset per millésime, administrative level and geometric simplification.

## Features

- **IGN Géoplateforme sources, 2017 to 2026** — every delivery format the IGN used over the period is handled: Shapefile (2017-2024, including the per-territory Lambert-93 / UTM deliveries of 2017-2018), GeoPackage (ADMIN-EXPRESS-COG 4.0 from 2025, CONTOURS-IRIS from 2024), and the renamed attributes of ADMIN-EXPRESS-COG 4.0 (`code_insee`, `nom_officiel`, `codes_siren_des_epci`, chef-lieu point layers...).
- **Communes and municipal arrondissements merged (PLM)** — the polygons of Paris, Lyon and Marseille are replaced by their 45 arrondissements in the commune level, giving a seamless partition without overlaps. The parent commune is kept in `INSEE_RATT`. When a delivery has no municipal arrondissement layer (2017 to 2019), the three communes are kept as is.
- **Territory enrichment** — levels are processed from region down to commune, and each feature is completed with the labels and codes of its region, département and EPCI. Millésimes are processed from the most recent one, so that older deliveries inherit the labels they lack (arrondissement and canton names, chef-lieux).
- **Complete arrondissement and canton codes** — ADMIN-EXPRESS up to 3.x delivers them local to the département (`2`, `04`), 4.0 complete (`012`, `0104`): they are always published complete, in their own datasets and on the communes.
- **Strictly typed identifiers** — `INSEE_COM`, `INSEE_DEP`, `INSEE_REG`, `CODE_EPCI`, `CODE_IRIS`... are strings (leading zeros and Corsica `2A`/`2B` preserved), annotated with their data-fair concepts (`x-refersTo`). The schema is sent with the lowercase keys data-fair derives from the GeoJSON property names (`INSEE_COM` → `insee_com`), otherwise it would be ignored. Every produced feature is validated against the dataset schema before publication.
- **Geometry simplification** — reprojection to WGS84 first, then simplification with a tolerance in degrees, so that the same setting gives the same result on Lambert-93 and WGS84 deliveries.
- **Pre-computed vector tiles** — the `vtPrepare` capability is set on the geometry column so that data-fair generates the vector tiles at indexing time.
- **Create then update** — the create mode gives each dataset a consistent slug (`<prefix>-<year>-<level>-<simplification>`), reuses a dataset of the account that already has it (e.g. after an interrupted run), then switches the configuration to the update mode with one row per created dataset.
- **Compact run log and disk usage** — download, extraction, conversion, normalization and upload are progress tasks updated in place, with one summary line per archive and per dataset; the files of a millésime are deleted before the next one.
- **Resumable downloads** — the Géoplateforme often cuts the transfer of the large archives; an interrupted download resumes from the received bytes with a range request.
- **Graceful stop** — external commands (7-Zip, ogr2ogr) and the extraction worker are killed when the run is interrupted, and nothing is published.

## Configuration

| Tab | Field | Description |
| --- | ----- | ----------- |
| Jeux de données | `datasetMode` | `create` or `update` |
| Jeux de données | `years` | Create mode: millésimes (2017 to 2026, default 2026), each row is produced for each of them |
| Jeux de données | `datasets` | Create mode: rows of `level` (`region`, `departement`, `arrondissement`, `canton`, `epci`, `commune`, `arrondissement-municipal`, `iris`) and `simplifyLevel` (`full` none, `medium` 0.001°, `simple` 0.01°). Update mode: one row per dataset, `year` + `level` + `simplifyLevel` + target `dataset`, filled after the creation |
| Jeux de données | `createAll` | Create mode: every level in every simplification for each millésime, for an initial load |
| Jeux de données | `datasetIdPrefix` | Create mode: slug prefix, default `france-contours` |
| Paramètres | `combineCommunesAndPlm` | Merge the arrondissements of Paris, Lyon and Marseille into the commune level (default on) |
| Paramètres | `enableVtPrepare` | Set `vtPrepare` on the geometry column (default on) |
| Paramètres | `skipUpload` | Dry run: download, convert and normalize without creating or updating any dataset |

A row can repeat a level with another simplification, e.g. an unsimplified commune dataset for analysis and a light one for small-scale maps. The IGN never republishes a past millésime, so its datasets are created once; the update mode serves to re-apply a fix of the processing. Cantons and municipal arrondissements only exist from 2020: the rows asking for them before are skipped with a warning.

## Produced datasets

| Level | Columns (besides `niveau`, `annee` and the geometry) |
| ----- | ------- |
| `region` | `NOM_REG`, `INSEE_REG`, `CHF_REG` |
| `departement` | `NOM_DEP`, `INSEE_DEP`, `CHF_DEP`, `NOM_REG`, `INSEE_REG` |
| `arrondissement` | `NOM_ARR`, `INSEE_ARR`, `NOM_DEP`, `INSEE_DEP`, `NOM_REG`, `INSEE_REG` |
| `canton` | `NOM_CAN`, `INSEE_CAN`, `NOM_DEP`, `INSEE_DEP`, `NOM_REG`, `INSEE_REG` |
| `epci` | `NOM_EPCI`, `CODE_EPCI`, `TYPE_EPCI` |
| `commune` | `NOM_COM`, `INSEE_COM`, `STATUT`, `POPULATION` (not in 2017), `INSEE_ARR`, `INSEE_CAN`, `NOM_REG`, `INSEE_REG`, `NOM_DEP`, `INSEE_DEP`, `NOM_EPCI`, `CODE_EPCI`, `TYPE_EPCI`, `INSEE_RATT` (PLM mode) |
| `arrondissement-municipal` | `NOM_COM`, `INSEE_COM`, `POPULATION`, `INSEE_RATT`, `NOM_REG`, `INSEE_REG`, `NOM_DEP`, `INSEE_DEP`, `NOM_EPCI`, `CODE_EPCI`, `TYPE_EPCI` |
| `iris` | `CODE_IRIS`, `NOM_IRIS`, `TYP_IRIS`, `NOM_COM`, `INSEE_COM` |

Feature ids are `reg-<year>-<code>`, `dep-<year>-<code>`, `arr-<year>-<code>`, `can-<year>-<code>`, `epci-<year>-<code>`, `com-<year>-<code>`, `arm-<year>-<code>` and `iris-<year>-<code>`.

Columns are annotated following the data-fair documentation guidelines (`lib/schemas.ts`): short titles, a description only where it adds something to the title (unit, convention, meaning of an empty value), value labels (`x-labels`) for coded columns, one concept per column (`label` on the entity name, `codeCommune`, `codeDepartement`, `codeRegion`, `codeEPCI`, `codeIRIS`, `geometry`), and reduced indexing capabilities on codes. The dataset metadata (`lib/metadata.ts`) — summary, markdown description, Licence Ouverte 2.0, origin, creator, keywords (including `contours`, used by applications to find these datasets), spatial and temporal coverage, update frequency and the versioned IGN product in `conformsTo` — is re-applied at every run: the processing owns these datasets, manual edits of those fields do not survive an update.

Notes on the sources:

- `TYPE_EPCI` follows the vocabulary of the delivery: abbreviations (`CC`, `CA`, `CU`...) up to 2024, full labels (`Communauté de communes`...) from ADMIN-EXPRESS-COG 4.0.
- The IGN "not available" markers (`NR`, `NC`, `ZZZZZZZZZ`) are normalized to empty codes.
- The Métropole de Lyon is delivered in the canton layer with every code set to `NR`: it is not a canton and is left out.
- ADMIN-EXPRESS-COG 2.x stores the code of a municipal arrondissement in `INSEE_COM` and its commune in `INSEE_RATT` (3.x: `INSEE_ARM` and `INSEE_COM`).
- CONTOURS-IRIS 2024 and 2025 are delivered as one archive per territory (metropolitan France and each overseas territory); they are downloaded and merged into a single dataset.

## Requirements

The worker needs GDAL (`ogr2ogr`, `ogrinfo`), which the processings image provides. Archives are extracted with a native 7-Zip binary (`7z`, `7zz` or `7za`) when one is on the PATH, and with [7z-wasm](https://github.com/use-strict/7z-wasm) otherwise.

## Development

```bash
npm i
npm run build-types   # regenerates the types from the JSON schemas
npm run lint
npm test              # node:test; the GDAL and native 7z tests are skipped when the binaries are missing
```

The tests do not need a data-fair instance. To run the processing for real, fill `config/local-test.mjs` (gitignored) with `dataFairUrl` and `dataFairAPIKey`.

## Release

Never bump `version` manually: releases are automated from tags (`publish-production.yml`) and every push on `main` is published to the staging registry.

## License

[AGPL-3.0-only](LICENSE)
