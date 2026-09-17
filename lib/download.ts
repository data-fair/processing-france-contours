import fs from 'fs-extra'
import path from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import type { AxiosInstance } from 'axios'
import { formatBytes } from '@data-fair/lib-utils/format/bytes.js'
import type { ProcessingContext } from '@data-fair/lib-common-types/processings.js'
import type { ProcessingConfig } from '#types/processingConfig/index.ts'
import { extract7z } from './extract.ts'
import { StopError, assertNotStopped, isStopped } from './state.ts'

type Log = ProcessingContext<ProcessingConfig>['log']

const MAX_ATTEMPTS = 5
const PROGRESS_STEP = 20 * 1024 * 1024
// The Géoplateforme answers 403 to the default "axios/x.y.z" user agent
const USER_AGENT = 'data-fair-processing-france-contours'

const downloadFile = async (url: string, filePath: string, axios: AxiosInstance, log: Log): Promise<void> => {
  const fileName = path.basename(filePath)
  const tmpFile = `${filePath}.tmp`
  const task = `Téléchargement de ${fileName}`

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    assertNotStopped()
    try {
      const response = await axios({ url, method: 'GET', responseType: 'stream', timeout: 600000, headers: { 'User-Agent': USER_AGENT } })
      const total = Number(response.headers['content-length']) || 0
      let downloaded = 0
      let lastReported = 0
      await log.task(task)
      const progress = new Transform({
        transform (chunk, _encoding, callback) {
          downloaded += chunk.length
          if (downloaded - lastReported >= PROGRESS_STEP) {
            lastReported = downloaded
            log.progress(task, downloaded, total).catch(() => {})
          }
          if (isStopped()) return callback(new StopError())
          callback(null, chunk)
        }
      })
      await pipeline(response.data, progress, fs.createWriteStream(tmpFile))
      await log.progress(task, downloaded, total || downloaded)
      await fs.move(tmpFile, filePath, { overwrite: true })
      await log.info(`Téléchargement terminé : ${fileName} (${formatBytes(downloaded)})`)
      return
    } catch (err: any) {
      await fs.remove(tmpFile).catch(() => {})
      if (isStopped()) throw new StopError()
      if (attempt === MAX_ATTEMPTS) throw new Error(`Impossible de télécharger ${url} après ${MAX_ATTEMPTS} tentatives : ${err.message}`)
      await log.warning(`Échec du téléchargement (${attempt}/${MAX_ATTEMPTS}) : ${err.message}. Nouvel essai dans 5s...`)
      await sleep(5000)
    }
  }
}

/**
 * Downloads and extracts a .7z archive into downloadDir. Both steps are skipped when their
 * output already exists, so the same ADMIN-EXPRESS archive is fetched once per run and shared
 * by every administrative level.
 */
export const downloadArchive = async (
  archiveUrl: string,
  downloadDir: string,
  axios: AxiosInstance,
  log: Log
): Promise<{ archivePath: string, extractDir: string }> => {
  await fs.ensureDir(downloadDir)
  const fileName = path.basename(new URL(archiveUrl).pathname)
  const archivePath = path.join(downloadDir, fileName)
  const extractDir = path.join(downloadDir, fileName.replace(/\.7z$/, ''))

  if (await fs.pathExists(archivePath)) {
    await log.info(`L'archive ${fileName} a déjà été téléchargée.`)
  } else {
    await downloadFile(archiveUrl, archivePath, axios, log)
  }

  if (await fs.pathExists(extractDir)) {
    await log.info(`L'archive ${fileName} a déjà été extraite.`)
  } else {
    assertNotStopped()
    await log.info(`Extraction de l'archive ${fileName}...`)
    const tmpDir = `${extractDir}.tmp`
    await fs.emptyDir(tmpDir)
    try {
      const extractor = await extract7z(archivePath, tmpDir)
      await fs.move(tmpDir, extractDir)
      await log.info(`Extraction terminée (${extractor === 'wasm' ? '7z-wasm' : '7z natif'}).`)
    } catch (err: any) {
      await fs.remove(tmpDir).catch(() => {})
      if (isStopped()) throw new StopError()
      throw new Error(`Erreur lors de l'extraction de ${fileName} : ${err.message}`)
    }
  }

  return { archivePath, extractDir }
}
