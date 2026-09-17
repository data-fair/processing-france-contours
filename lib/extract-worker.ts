// Runs 7-Zip compiled to WebAssembly in a worker thread: callMain() is synchronous and
// would otherwise block the event loop (logs, stop signal) for the whole extraction.
import path from 'node:path'
import { parentPort, workerData } from 'node:worker_threads'
import SevenZipFactory, { type SevenZipModuleFactory } from '7z-wasm'

// The package is CommonJS with an ESM-style .d.ts: the default import is the factory itself at
// runtime while TypeScript sees the module object
const SevenZip = ('default' in SevenZipFactory ? SevenZipFactory.default : SevenZipFactory) as SevenZipModuleFactory

const { archivePath, extractDir } = workerData as { archivePath: string, extractDir: string }

const errors: string[] = []
let exitCode = 0
const sevenZip = await SevenZip({
  print: () => {},
  printErr: (line: string) => { errors.push(line) },
  stdin: () => -1, // EOF, 7-Zip must never wait for input
  quit: (code: number) => { exitCode = code }
})

// Mount the real filesystem so that neither the archive nor the extracted files go through memory
sevenZip.FS.mkdir('/archive')
sevenZip.FS.mount(sevenZip.NODEFS, { root: path.dirname(archivePath) }, '/archive')
sevenZip.FS.mkdir('/output')
sevenZip.FS.mount(sevenZip.NODEFS, { root: extractDir }, '/output')

try {
  sevenZip.callMain(['x', '-y', '-bd', '-o/output', `/archive/${path.basename(archivePath)}`])
} catch (err: any) {
  // Emscripten reports a non-zero exit through an ExitStatus exception
  if (typeof err?.status === 'number') exitCode = err.status
  else throw err
}

if (exitCode !== 0) throw new Error(`7z-wasm exited with code ${exitCode}: ${errors.slice(-3).join(' | ')}`)
parentPort?.postMessage('done')
