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

/** Converts one layer to a WGS84 RFC 7946 GeoJSON file */
export const ogr2geojson = async (inputPath: string, layer: string | undefined, outputPath: string): Promise<void> => {
  const tmpOutput = `${outputPath}.tmp`
  try {
    await runCommand('ogr2ogr', ['-f', 'GeoJSON', '-t_srs', 'EPSG:4326', '-lco', 'RFC7946=YES', tmpOutput, inputPath, ...(layer ? [layer] : [])])
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
  const { extractDir, format, layer, outputDir, optional, log } = options
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

  const outputPaths = jobs.map(job => path.join(outputDir, job.output))
  const todo = jobs.filter((_job, i) => !fs.pathExistsSync(outputPaths[i]))
  if (todo.length) {
    // task names must be unique in the run: the archive tells the conversions apart
    const task = `Conversion de la couche ${layer} de ${path.basename(extractDir)}`
    await log.task(task)
    for (const [i, job] of todo.entries()) {
      assertNotStopped()
      await ogr2geojson(job.input, job.layer, path.join(outputDir, job.output))
      await log.progress(task, i + 1, todo.length)
    }
  }
  return outputPaths
}
