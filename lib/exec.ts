import { execFile, type ExecFileOptions } from 'node:child_process'
import { StopError, isStopped, trackChild } from './state.ts'

export interface ExecResult { stdout: string, stderr: string }

/**
 * execFile wrapper that registers the child so stop() can kill it, and reports a stop
 * (instead of the raw SIGTERM error) when the kill was ours.
 */
export const runCommand = (command: string, args: string[], options: ExecFileOptions = {}): Promise<ExecResult> => {
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, { maxBuffer: 50 * 1024 * 1024, ...options }, (err, stdout, stderr) => {
      if (err) {
        if (isStopped()) return reject(new StopError())
        const detail = String(stderr || '').trim().split('\n').slice(-3).join(' | ')
        err.message = detail ? `${err.message} — ${detail}` : err.message
        return reject(err)
      }
      resolve({ stdout: String(stdout), stderr: String(stderr) })
    })
    trackChild(child)
  })
}

/** True when the executable cannot be found on PATH (as opposed to a real execution failure). */
export const isMissingBinary = (err: unknown): boolean => (err as NodeJS.ErrnoException)?.code === 'ENOENT'
