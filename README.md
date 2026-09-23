# @data-fair/processing-france-contours

Processing plugin for [data-fair/processings](https://github.com/data-fair/processings) that publishes and keeps up to date the official French administrative boundaries (IGN ADMIN-EXPRESS-COG and CONTOURS-IRIS), one dataset per administrative level and geometric simplification.

## Features

- **IGN Géoplateforme sources, 2017 to 2026** — every delivery format the IGN used over the period is handled: Shapefile (2017-2024, including the per-territory Lambert-93 / UTM deliveries of 2017-2018), GeoPackage (ADMIN-EXPRESS-COG 4.0 from 2025, CONTOURS-IRIS from 2024), and the renamed attributes of ADMIN-EXPRESS-COG 4.0 (`code_insee`, `nom_officiel`, `codes_siren_des_epci`, chef-lieu point layers...).
- **Communes and municipal arrondissements merged (PLM)** — the polygons of Paris, Lyon and Marseille are replaced by their 45 arrondissements in the commune level, giving a seamless partition without overlaps. The parent commune is kept in `INSEE_RATT`. When a delivery has no arrondissement layer (2017), the three communes are kept as is.
- **Territory enrichment** — levels are processed from region down to commune, and each feature is completed with the labels and codes of its region, département and EPCI.
- **Strictly typed identifiers** — `INSEE_COM`, `INSEE_DEP`, `INSEE_REG`, `CODE_EPCI`, `CODE_IRIS`... are strings (leading zeros and Corsica `2A`/`2B` preserved), annotated with their INSEE concepts (`x-refersTo`). Every produced feature is validated against the dataset schema before publication.
- **Geometry simplification** — reprojection to WGS84 first, then simplification with a tolerance in degrees, so that the same setting gives the same result on Lambert-93 and WGS84 deliveries.
- **Pre-computed vector tiles** — the `vtPrepare` capability is set on the geometry column so that data-fair generates the vector tiles at indexing time.
- **Create then update** — the create mode gives each dataset a consistent slug (`<prefix>-<year>-<level>-<simplification>`), reuses a dataset of the account that already has it (e.g. after an interrupted run), then switches the configuration to the update mode with one row per created dataset.
- **Resumable downloads** — the Géoplateforme often cuts the transfer of the large archives; an interrupted download resumes from the received bytes with a range request.
- **Graceful stop** — external commands (7-Zip, ogr2ogr) and the extraction worker are killed when the run is interrupted, and nothing is published.

## Configuration

| Tab | Field | Description |
| --- | ----- | ----------- |
| Jeux de données | `datasetMode` | `create` or `update` |
| Jeux de données | `datasets` | One row per dataset: `level` (`region`, `departement`, `epci`, `commune`, `arrondissement-municipal`, `iris`), `simplifyLevel` (`full`, `precise` 0.0001°, `medium` 0.001°, `simple` 0.01°) and, in update mode, the target `dataset` |
| Jeux de données | `createAll` | Create mode only: every level in every simplification (24 datasets), for an initial load |
| Jeux de données | `datasetIdPrefix` | Create mode only: slug prefix, default `france-contours` |
| Paramètres | `year` | Millésime (2017 to 2026, default 2026) |
| Paramètres | `combineCommunesAndPlm` | Merge the arrondissements of Paris, Lyon and Marseille into the commune level (default on) |
| Paramètres | `enableVtPrepare` | Set `vtPrepare` on the geometry column (default on) |
| Paramètres | `skipUpload` | Dry run: download, convert and normalize without creating or updating any dataset |

A row can repeat a level with another simplification, e.g. a precise commune dataset for analysis and a light one for small-scale maps. Archives are downloaded once per run whatever the number of rows.

## Produced datasets

| Level | Columns (besides `niveau`, `annee` and the geometry) |
| ----- | ------- |
| `region` | `NOM_REG`, `INSEE_REG`, `CHF_REG` |
| `departement` | `NOM_DEP`, `INSEE_DEP`, `CHF_DEP`, `NOM_REG`, `INSEE_REG` |
| `epci` | `NOM_EPCI`, `CODE_EPCI`, `TYPE_EPCI` |
| `commune` | `NOM_COM`, `INSEE_COM`, `STATUT`, `POPULATION` (not in 2017), `INSEE_ARR`, `INSEE_CAN`, `NOM_REG`, `INSEE_REG`, `NOM_DEP`, `INSEE_DEP`, `NOM_EPCI`, `CODE_EPCI`, `TYPE_EPCI`, `INSEE_RATT` (PLM mode) |
| `arrondissement-municipal` | `NOM_COM`, `INSEE_COM`, `POPULATION`, `INSEE_RATT`, `NOM_REG`, `INSEE_REG`, `NOM_DEP`, `INSEE_DEP`, `NOM_EPCI`, `CODE_EPCI`, `TYPE_EPCI` |
| `iris` | `CODE_IRIS`, `NOM_IRIS`, `TYP_IRIS`, `NOM_COM`, `INSEE_COM` |

Feature ids are `reg-<year>-<code>`, `dep-<year>-<code>`, `epci-<year>-<code>`, `com-<year>-<code>`, `arm-<year>-<code>` and `iris-<year>-<code>`.

Columns are annotated following the data-fair documentation guidelines (`lib/schemas.ts`): short titles, a description only where it adds something to the title (unit, convention, meaning of an empty value), value labels (`x-labels`) for coded columns, one concept per column (`label` on the entity name, `codeCommune`, `codeDepartement`, `codeRegion`, `codeEPCI`, `codeIRIS`, `geometry`), and reduced indexing capabilities on codes. The dataset metadata (`lib/metadata.ts`) — summary, markdown description, Licence Ouverte 2.0, origin, creator, keywords (including `contours`, used by applications to find these datasets), spatial and temporal coverage, update frequency and the versioned IGN product in `conformsTo` — is re-applied at every run: the processing owns these datasets, manual edits of those fields do not survive an update.

Notes on the sources:

- `TYPE_EPCI` follows the vocabulary of the delivery: abbreviations (`CC`, `CA`, `CU`...) up to 2024, full labels (`Communauté de communes`...) from ADMIN-EXPRESS-COG 4.0.
- The IGN "not available" markers (`NR`, `NC`, `ZZZZZZZZZ`) are normalized to empty codes.
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
