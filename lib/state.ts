import type { ChildProcess } from 'node:child_process'
import type { Worker } from 'node:worker_threads'

let shouldBeStopped = false

// Long-running external work (7z, ogr2ogr, the extraction worker thread) is tracked here
// so that stop() can terminate it: the processings worker only grants a short grace period
// before killing the whole run.
const children = new Set<ChildProcess | Worker>()

export class StopError extends Error {
  constructor () {
    super('Traitement interrompu.')
    this.name = 'StopError'
  }
}

export const isStopError = (err: unknown): err is StopError => err instanceof StopError

export const setShouldBeStopped = (v: boolean): void => {
  shouldBeStopped = v
  if (v) killChildren()
}

export const isStopped = (): boolean => shouldBeStopped

export const resetStopState = (): void => {
  shouldBeStopped = false
}

export const assertNotStopped = (): void => {
  if (shouldBeStopped) throw new StopError()
}

export const trackChild = (child: ChildProcess | Worker): void => {
  children.add(child)
  child.once('exit', () => children.delete(child))
}

export const killChildren = (): void => {
  for (const child of children) {
    if ('terminate' in child) child.terminate().catch(() => {})
    else child.kill('SIGTERM')
  }
}
