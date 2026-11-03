import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { constants } from 'node:os'
import { dirname, join } from 'node:path'

/** The signals that stop a run: Ctrl-C, a plain kill and a closed terminal. */
export const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP']
const FORWARD_TIMEOUT_MS = 15_000

/** The exit code a shell reports for a process stopped by `signal`. */
export const signalExitCode = (signal) => 128 + (constants.signals[signal] ?? 1)

/** Signals a child's whole process group (it must have been started `detached`); gone already is fine. */
export function signalGroup(child, signal) {
  try {
    process.kill(-child.pid, signal)
  } catch {
    // no such group: nothing left to signal
  }
}

/**
 * Runs `command args` in its own process group with this terminal's output, and resolves with its exit
 * code. SIGINT, SIGTERM and SIGHUP go on to the whole group, which is killed if it has not stopped
 * after 15 seconds. A wrapper script that waits on its child (a test slot) cannot hold the run up or
 * leave it behind.
 */
export function runInGroup(command, args, env) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, { stdio: 'inherit', env, detached: true })
    let killTimer
    const forward = (signal) => {
      signalGroup(child, signal)
      killTimer ??= setTimeout(() => signalGroup(child, 'SIGKILL'), FORWARD_TIMEOUT_MS)
    }
    for (const signal of SIGNALS) process.on(signal, forward)
    child.on('error', (error) => {
      console.error(`cannot run ${command}: ${error.message}`)
      resolveRun(1)
    })
    child.on('exit', (code, signal) => {
      clearTimeout(killTimer)
      for (const name of SIGNALS) process.off(name, forward)
      signalGroup(child, 'SIGKILL')
      resolveRun(code ?? signalExitCode(signal))
    })
  })
}

/** The nearest folder at or above `path` that exists. */
function existingFolder(path) {
  let folder = path
  while (!existsSync(folder)) folder = dirname(folder)
  return folder
}

/**
 * Whether `out` is a safe place for real data. Null when it is outside any git work tree, or inside
 * one that ignores it; otherwise the reason it is refused. The check asks git about a file in the
 * folder, so a rule that ignores a folder (".replica-out/") counts.
 */
export function outDirProblem(out) {
  const folder = existingFolder(out)
  const inside = spawnSync('git', ['-C', folder, 'rev-parse', '--is-inside-work-tree'], {
    encoding: 'utf8',
  })
  if (inside.status !== 0 || inside.stdout.trim() !== 'true') return null
  const ignored = spawnSync('git', ['-C', folder, 'check-ignore', '-q', join(out, 'run.json')])
  if (ignored.status === 0) return null
  return `${out} is inside a git work tree that does not ignore it, so the output could be committed. Use a folder git ignores (.replica-out/ is) or one outside the work tree.`
}
