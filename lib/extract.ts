import { Worker } from 'node:worker_threads'
import { isMissingBinary, runCommand } from './exec.ts'
import { StopError, isStopped, trackChild } from './state.ts'

// Native binaries, in order of preference. The processings worker image does not ship one at the
// moment (p7zip was dropped from its Dockerfile in 2024), hence the WebAssembly fallback below.
const NATIVE_CANDIDATES = ['7z', '7zz', '7za']

export type Extractor = 'native' | 'wasm'

const extractWithWasm = (archivePath: string, extractDir: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./extract-worker.ts', import.meta.url), { workerData: { archivePath, extractDir } })
    trackChild(worker)
    worker.once('error', reject)
    worker.once('exit', (code) => {
      if (isStopped()) reject(new StopError())
      else if (code !== 0) reject(new Error(`extraction worker exited with code ${code}`))
      else resolve()
    })
  })
}

/**
 * Extracts a .7z archive into extractDir, using a native 7-Zip binary when one is available on
 * PATH and 7z-wasm otherwise. Returns which extractor was used (mostly for logging/tests).
 */
export const extract7z = async (archivePath: string, extractDir: string, force?: Extractor): Promise<Extractor> => {
  if (force !== 'wasm') {
    for (const bin of NATIVE_CANDIDATES) {
      try {
        await runCommand(bin, ['x', '-y', '-bd', `-o${extractDir}`, archivePath])
        return 'native'
      } catch (err) {
        if (!isMissingBinary(err)) throw err
      }
    }
    if (force === 'native') throw new Error(`no native 7-Zip binary found (tried ${NATIVE_CANDIDATES.join(', ')})`)
  }
  await extractWithWasm(archivePath, extractDir)
  return 'wasm'
}
