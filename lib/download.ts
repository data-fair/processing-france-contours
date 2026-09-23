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

/** Consecutive failures without any byte received; an interruption that made progress does not count */
const MAX_FAILURES = 5
const PROGRESS_STEP = 20 * 1024 * 1024
// The Géoplateforme answers 403 to the default "axios/x.y.z" user agent
const USER_AGENT = 'data-fair-processing-france-contours'

export const downloadFile = async (url: string, filePath: string, axios: AxiosInstance, log: Log): Promise<void> => {
  const fileName = path.basename(filePath)
  const tmpFile = `${filePath}.tmp`
  const task = `Téléchargement de ${fileName}`
  const receivedSize = async () => (await fs.pathExists(tmpFile)) ? (await fs.stat(tmpFile)).size : 0

  for (let failures = 0; ;) {
    assertNotStopped()
    // The Géoplateforme often cuts large transfers: resume from the bytes already received
    const received = await receivedSize()
    try {
      const headers: Record<string, string> = { 'User-Agent': USER_AGENT }
      if (received) headers.Range = `bytes=${received}-`
      const response = await axios({ url, method: 'GET', responseType: 'stream', timeout: 600000, headers })
      // a 200 to a range request means the server sends the whole file again
      const resumed = received > 0 && response.status === 206
      let downloaded = resumed ? received : 0
      const total = downloaded + (Number(response.headers['content-length']) || 0)
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
      await pipeline(response.data, progress, fs.createWriteStream(tmpFile, { flags: resumed ? 'a' : 'w' }))
      await log.progress(task, downloaded, total || downloaded)
      await fs.move(tmpFile, filePath, { overwrite: true })
      await log.info(`Téléchargement terminé : ${fileName} (${formatBytes(downloaded)})`)
      return
    } catch (err: any) {
      if (isStopped()) throw new StopError()
      // range beyond the end: the partial file is unusable, start over
      if (err.response?.status === 416) await fs.remove(tmpFile)
      const size = await receivedSize()
      if (size <= received) failures++
      else failures = 0
      if (failures >= MAX_FAILURES) throw new Error(`Impossible de télécharger ${url} après ${MAX_FAILURES} échecs consécutifs : ${err.message}`)
      const delay = 5 * 2 ** failures
      await log.warning(`Téléchargement de ${fileName} interrompu à ${formatBytes(size)} (${err.message}), reprise dans ${delay}s.`)
      await sleep(delay * 1000)
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

  if (!await fs.pathExists(archivePath)) await downloadFile(archiveUrl, archivePath, axios, log)

  if (!await fs.pathExists(extractDir)) {
    assertNotStopped()
    const tmpDir = `${extractDir}.tmp`
    await fs.emptyDir(tmpDir)
    try {
      const extractor = await extract7z(archivePath, tmpDir)
      await fs.move(tmpDir, extractDir)
      await log.info(`Archive ${fileName} extraite (${extractor === 'wasm' ? '7z-wasm' : '7z natif'}).`)
    } catch (err: any) {
      await fs.remove(tmpDir).catch(() => {})
      if (isStopped()) throw new StopError()
      throw new Error(`Erreur lors de l'extraction de ${fileName} : ${err.message}`)
    }
  }

  return { archivePath, extractDir }
}
