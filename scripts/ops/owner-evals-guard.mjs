import { basename, resolve, sep } from 'node:path'

// The owner's evals (evals/owner-caught) are the owner's to write: no session, main or agent, edits them, and the
// label that lets a pull request change them is applied by the owner by hand. agent-guard.mjs asks this module.

const FOLDER = 'evals/owner-caught'
export const OWNER_EVALS_LABEL = 'owner-evals'
const WHY =
  'evals/owner-caught belongs to the owner: no session edits it, and the owner-evals label is the owner’s to apply by hand (evals/owner-caught/README.md).'

/** Programs that only read what they are given. `git` is read-only for the subcommands below. */
const READ_ONLY = new Set(['cat', 'head', 'tail', 'grep', 'rg', 'ls', 'find', 'wc', 'diff'])
const GIT_READ_ONLY = new Set(['diff', 'log', 'show', 'status', 'blame'])
/** `find` actions that change or run something. */
const FIND_WRITES = new Set([
  '-delete',
  '-exec',
  '-execdir',
  '-ok',
  '-okdir',
  '-fprint',
  '-fprintf',
])
const GIT_VALUE_FLAGS = new Set(['-C', '-c'])
const MESSAGE_FLAGS = new Set(['-m', '--message'])
const API_WRITES = new Set(['-f', '-F', '--field', '--raw-field', '--input'])

/** The refusal for an Edit, Write or NotebookEdit of this path, or undefined. */
export function deniedPath(filePath, cwd = '') {
  if (typeof filePath !== 'string' || filePath === '') return undefined
  const parts = resolve(cwd, filePath).split(sep)
  for (let i = 0; i + 1 < parts.length; i++) {
    if (parts[i] === 'evals' && parts[i + 1] === 'owner-caught') return WHY
  }
  return undefined
}

function gitVerb(words) {
  const args = words.slice(1)
  for (let i = 0; i < args.length; i++) {
    if (GIT_VALUE_FLAGS.has(args[i])) i++
    else if (!args[i].startsWith('-')) return args[i]
  }
  return undefined
}

function readsOnly(words) {
  const tool = basename(words[0] ?? '')
  if (tool === 'git') return GIT_READ_ONLY.has(gitVerb(words))
  if (tool === 'find') return !words.some((word) => FIND_WRITES.has(word))
  return READ_ONLY.has(tool)
}

/** The words that can name a path: a gh call's text and a commit's message are prose, so they are left out. */
function pathWords(words) {
  if (basename(words[0] ?? '') === 'gh') return []
  return words.filter(
    (word, i) => !MESSAGE_FLAGS.has(words[i - 1]) && !/^(-m|--message=)/.test(word),
  )
}

/** The refusal for a simple command (its words, leading assignments and wrappers removed) that writes under the folder. */
export function deniedWrite(words) {
  if (!pathWords(words).some((word) => word.includes(FOLDER))) return undefined
  return readsOnly(words) ? undefined : WHY
}

/** The refusal for a whole command line that redirects output into the folder, whatever program writes it. */
export function deniedRedirect(command) {
  return new RegExp(`\\d*>>?\\s*["']?[^\\s;&|"']*${FOLDER}`).test(command) ? WHY : undefined
}

/** Whether a gh call changes labels, by any route: pr edit, issue edit, the label command, or a writing api call. */
function changesLabels(words, verbs) {
  if (verbs[0] === 'label') return true
  if (verbs[0] === 'pr' || verbs[0] === 'issue') return verbs[1] === 'edit' || verbs[1] === 'create'
  if (verbs[0] !== 'api') return false
  const method = words.findIndex((word) => word === '-X' || word === '--method')
  const named = method >= 0 && words[method + 1]?.toUpperCase() !== 'GET'
  return named || words.some((word) => API_WRITES.has(word) || /^--(raw-)?field=/.test(word))
}

/** The refusal for a gh call (`verbs` are its first two subcommands) that adds or creates the owner-evals label. */
export function deniedLabel(words, verbs) {
  const names = words.some((word) => word.toLowerCase().includes(OWNER_EVALS_LABEL))
  return names && changesLabels(words, verbs) ? WHY : undefined
}
