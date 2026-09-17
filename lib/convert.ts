import fs from 'fs-extra'
import path from 'node:path'
import type { ProcessingContext } from '@data-fair/lib-common-types/processings.js'
import type { ProcessingConfig } from '#types/processingConfig/index.ts'
import type { ArchiveFormat } from './sources.ts'
import { runCommand } from './exec.ts'
import { assertNotStopped } from './state.ts'

type Log = ProcessingContext<ProcessingConfig>['log']

export interface ConvertOptions {
  extractDir: string
  format: ArchiveFormat
  /** GeoPackage layer name or Shapefile basename, matched case-insensitively */
  layer: string
  outputDir: string
  /** Tolerance in degrees, applied after reprojection; null keeps the source geometries */
  simplifyTolerance: number | null
  /** Return an empty list instead of failing when the layer is absent (ARM in overseas deliveries, chef-lieu layers) */
  optional?: boolean
  log: Log
}

const findFilesRecursive = async (dir: string, matcher: (fileName: string) => boolean): Promise<string[]> => {
  const results: string[] = []
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) results.push(...(await findFilesRecursive(fullPath, matcher)))
    else if (entry.isFile() && matcher(entry.name)) results.push(fullPath)
  }
  return results.sort()
}

export const listGpkgLayers = async (gpkgPath: string): Promise<string[]> => {
  const { stdout } = await runCommand('ogrinfo', ['-so', '-ro', gpkgPath])
  return [...stdout.matchAll(/^\d+:\s+([\w-]+)/gm)].map(m => m[1])
}

/**
 * Converts one layer to a WGS84 RFC 7946 GeoJSON file.
 *
 * ogr2ogr applies -simplify in the units of the *source* SRS, before -t_srs: on the Lambert-93
 * deliveries (ADMIN-EXPRESS 2017-2018, CONTOURS-IRIS up to 2025) a tolerance expressed in degrees
 * would be interpreted as a fraction of a meter and simplify nothing. The reprojection is therefore
 * done first, into a temporary GeoPackage, and the simplification in a second pass.
 */
export const ogr2geojson = async (inputPath: string, layer: string | undefined, outputPath: string, simplifyTolerance: number | null): Promise<void> => {
  const tmpOutput = `${outputPath}.tmp`
  const layerArgs = layer ? [layer] : []
  try {
    if (simplifyTolerance) {
      const reprojected = `${outputPath}.4326.gpkg`
      await fs.remove(reprojected)
      await runCommand('ogr2ogr', ['-f', 'GPKG', '-t_srs', 'EPSG:4326', reprojected, inputPath, ...layerArgs])
      try {
        await runCommand('ogr2ogr', ['-f', 'GeoJSON', '-lco', 'RFC7946=YES', '-simplify', String(simplifyTolerance), tmpOutput, reprojected])
      } finally {
        await fs.remove(reprojected)
      }
    } else {
      await runCommand('ogr2ogr', ['-f', 'GeoJSON', '-t_srs', 'EPSG:4326', '-lco', 'RFC7946=YES', tmpOutput, inputPath, ...layerArgs])
    }
    await fs.move(tmpOutput, outputPath, { overwrite: true })
  } catch (err) {
    await fs.remove(tmpOutput).catch(() => {})
    throw err
  }
}

/**
 * Finds the requested layer in an extracted delivery (one GeoPackage layer, or one Shapefile per
 * territory in the older deliveries) and converts each occurrence to GeoJSON.
 */
export const convertLayer = async (options: ConvertOptions): Promise<string[]> => {
  const { extractDir, format, layer, outputDir, simplifyTolerance, optional, log } = options
  const wanted = layer.toLowerCase()
  await fs.ensureDir(outputDir)

  // [input file, layer to select inside it, output file name]
  const jobs: Array<{ input: string, layer?: string, output: string }> = []
  if (format === 'gpkg') {
    for (const gpkgPath of await findFilesRecursive(extractDir, f => f.toLowerCase().endsWith('.gpkg'))) {
      const found = (await listGpkgLayers(gpkgPath)).find(l => l.toLowerCase() === wanted)
      if (found) jobs.push({ input: gpkgPath, layer: found, output: `${wanted}.geojson` })
    }
  } else {
    const shpFiles = await findFilesRecursive(extractDir, f => f.toLowerCase() === `${wanted}.shp`)
    for (const shpPath of shpFiles) {
      const suffix = shpFiles.length > 1 ? `-${path.basename(path.dirname(shpPath)).toLowerCase()}` : ''
      jobs.push({ input: shpPath, output: `${wanted}${suffix}.geojson` })
    }
  }

  if (jobs.length === 0) {
    if (optional) {
      await log.info(`Couche ${layer} absente de ${path.basename(extractDir)}, ignorée.`)
      return []
    }
    throw new Error(`Couche ${layer} introuvable dans ${extractDir}`)
  }

  const convertedPaths: string[] = []
  for (const job of jobs) {
    assertNotStopped()
    const outputPath = path.join(outputDir, job.output)
    if (await fs.pathExists(outputPath)) {
      await log.info(`Fichier déjà converti : ${job.output}`)
    } else {
      await log.info(`Conversion de ${path.relative(extractDir, job.input)}${job.layer ? ` (couche ${job.layer})` : ''} vers GeoJSON...`)
      await ogr2geojson(job.input, job.layer, outputPath, simplifyTolerance)
    }
    convertedPaths.push(outputPath)
  }
  return convertedPaths
}
