import fs from 'fs-extra'
import path from 'node:path'
import { promisify } from 'node:util'
import { setTimeout as sleep } from 'node:timers/promises'
import FormData from 'form-data'
import type { AxiosInstance } from 'axios'
import { formatBytes } from '@data-fair/lib-utils/format/bytes.js'
import type { ProcessingContext } from '@data-fair/lib-common-types/processings.js'
import type { ProcessingConfig } from '#types/processingConfig/index.ts'
import type { DatasetProperty } from './schemas.ts'
import type { DatasetMetadata } from './metadata.ts'
import { StopError, assertNotStopped, isStopped } from './state.ts'

type Log = ProcessingContext<ProcessingConfig>['log']

export interface ExistingDataset {
  id: string
  slug: string
  title: string
}

const MAX_ATTEMPTS = 3

/**
 * Indexes the datasets of the processing owner by slug. A dataset id cannot be chosen at creation
 * time, so the slug is the only stable handle to update a dataset instead of re-creating it.
 *
 * `mine=true` is essential: without it the listing also returns the public datasets of other
 * accounts, whose slugs would collide with ours. And a failure must abort the run: data-fair
 * resolves a slug conflict by suffixing the new dataset (`-2`), i.e. an empty index would
 * silently create duplicates of every dataset.
 */
export const fetchExistingDatasetsBySlug = async (axios: AxiosInstance, log: Log): Promise<Map<string, ExistingDataset>> => {
  const bySlug = new Map<string, ExistingDataset>()
  const size = 1000
  for (let page = 1; ; page++) {
    const res = await axios.get('api/v1/datasets', { params: { mine: true, select: 'id,slug,title', size, page } })
    const results: ExistingDataset[] = res.data?.results ?? []
    for (const dataset of results) {
      if (dataset.slug) bySlug.set(dataset.slug, { id: dataset.id, slug: dataset.slug, title: dataset.title })
    }
    if (results.length < size || page * size >= (res.data?.count ?? 0)) break
  }
  await log.info(`${bySlug.size} jeux de données du compte indexés par slug.`)
  return bySlug
}

export interface DatasetUpload {
  slug: string
  title: string
  filePath: string
  schema: DatasetProperty[]
  metadata: DatasetMetadata
}

/**
 * Creates (with the given slug) or updates a dataset from a GeoJSON file. The processing owns
 * these datasets: title, schema annotations and metadata are re-applied at every run.
 */
export const uploadDataset = async (
  { slug, title, filePath, schema, metadata }: DatasetUpload,
  existing: { id: string } | undefined,
  axios: AxiosInstance,
  log: Log
): Promise<{ id: string, title: string }> => {
  assertNotStopped()
  const actionLabel = existing ? 'Mise à jour' : 'Création'
  const stats = await fs.stat(filePath)
  await log.info(`${actionLabel} du jeu de données "${title}" (${formatBytes(stats.size)})...`)

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    assertNotStopped()
    try {
      const formData = new FormData()
      formData.append('schema', JSON.stringify(schema))
      formData.append('title', title)
      if (!existing) formData.append('slug', slug)
      // multipart parts are strings, data-fair parses the object/array fields as JSON
      for (const [key, value] of Object.entries(metadata)) {
        formData.append(key, typeof value === 'string' ? value : JSON.stringify(value))
      }
      formData.append('file', fs.createReadStream(filePath), { filename: path.basename(filePath) })
      const contentLength = await promisify(formData.getLength.bind(formData))()

      const response = await axios({
        method: 'post',
        url: existing ? `api/v1/datasets/${existing.id}` : 'api/v1/datasets',
        data: formData,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        headers: { ...formData.getHeaders(), 'content-length': String(contentLength) },
        timeout: 1800000 // 30 minutes, the largest layers weigh several hundred MB
      })

      const dataset = response.data
      await log.info(`${actionLabel} réussie : ${dataset.title ?? title} (id : ${dataset.id}, slug : ${dataset.slug ?? slug})`)
      return { id: dataset.id, title: dataset.title ?? title }
    } catch (err: any) {
      if (isStopped()) throw new StopError()
      const message = err.response?.data?.message ?? err.response?.data ?? err.message
      if (attempt === MAX_ATTEMPTS) throw new Error(`Échec du téléversement de ${title} après ${MAX_ATTEMPTS} tentatives : ${message}`)
      await log.warning(`Échec du téléversement (${attempt}/${MAX_ATTEMPTS}) pour ${title} : ${message}. Nouvel essai dans 10s...`)
      await sleep(10000)
    }
  }
  throw new Error('unreachable')
}
