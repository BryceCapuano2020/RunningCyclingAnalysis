import { basename, resolve, sep } from 'node:path'

// The owner's evals (evals/owner-caught) are the owner's to write: no session, main or agent, edits them, and the
// label that lets a pull request change them is applied by the owner by hand. agent-guard.mjs asks this module.

export const OWNER_EVALS_LABEL = 'owner-evals'
const WHY =
  'evals/owner-caught belongs to the owner: no session edits it, and the owner-evals label is the owner’s to apply by hand (evals/owner-caught/README.md).'

/** Programs that only read what they are given. `sed`, `awk`, `find` and `git` are read-only unless a check below says otherwise. */
const READ_ONLY = new Set([
  'cat',
  'head',
  'tail',
  'grep',
  'rg',
  'ls',
  'find',
  'wc',
  'diff',
  'sed',
  'awk',
])
const GIT_READ_ONLY = new Set(['diff', 'log', 'show', 'status', 'blame', 'grep'])
/** Programs that change or remove what they are given, so even naming a parent of the folder (`evals`) is refused. */
const DESTRUCTIVE = new Set([
  'rm',
  'rmdir',
  'mv',
  'cp',
  'ln',
  'chmod',
  'chown',
  'truncate',
  'rsync',
  'unlink',
  'dd',
  'install',
  'tee',
  'shred',
  'touch',
  'trash',
])
/** Git subcommands that write files at the paths they are given; checkout and reset do so only for paths, not refs. */
const GIT_PATH_WRITES = new Set(['rm', 'mv', 'restore', 'apply', 'clean'])
const GIT_PATH_OR_REF = new Set(['checkout', 'reset'])
const FIND_WRITES = new Set([
  '-delete',
  '-exec',
  '-execdir',
  '-ok',
  '-okdir',
  '-fprint',
  '-fprintf',
])
const AWK_WRITES = /(print|printf)[^;}]*>|system\s*\(|\|\s*"|\|&/
const GIT_VALUE_FLAGS = new Set(['-C', '-c'])
const MESSAGE_FLAGS = new Set(['-m', '--message'])
const LABEL_FLAGS = new Set(['--add-label', '--label', '-l'])
const API_FIELDS = new Set(['-f', '-F', '--field', '--raw-field', '--input'])

/** A glob segment as a regular expression. */
function globOf(segment) {
  const body = segment
    .replace(/[.+^${}()|\\]/g, '\\$&')
    .replace(/\*+/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${body}$`)
}

/** Whether a path segment names `literal`, exactly or by a glob that also holds a literal character of its own. */
function names(segment, literal, { bare = false } = {}) {
  if (segment === literal) return true
  if (!/[*?[]/.test(segment)) return false
  if (!bare && !/[^*?[\]]/.test(segment)) return false
  return globOf(segment).test(literal)
}

/**
 * How a word relates to the owner's folder: 'inside' for the folder, a path below it, or a glob into it ('evals/*', an
 * absolute path into the repository's copy); 'parent' for `evals` itself; otherwise null. A word with whitespace is prose.
 */
export function relation(word) {
  if (/\s/.test(word)) return null
  const parts = word.split('/').filter((part) => part !== '' && part !== '.')
  for (let i = 0; i < parts.length; i++) {
    if (!names(parts[i], 'evals')) continue
    if (i === parts.length - 1) return 'parent'
    if (names(parts[i + 1], 'owner-caught', { bare: true })) return 'inside'
  }
  return null
}

/** The refusal for an Edit, Write or NotebookEdit of this path, or undefined. */
export function deniedPath(filePath, cwd = '') {
  if (typeof filePath !== 'string' || filePath === '') return undefined
  const parts = resolve(cwd, filePath).split(sep)
  for (let i = 0; i + 1 < parts.length; i++) {
    if (parts[i] === 'evals' && parts[i + 1] === 'owner-caught') return WHY
  }
  return undefined
}

function gitArgs(words) {
  const args = []
  for (let i = 1; i < words.length; i++) {
    if (GIT_VALUE_FLAGS.has(words[i])) i++
    else args.push(words[i])
  }
  return args
}

/** The words that can be paths: a commit's message is prose, and a gh call's text is checked for the label instead. */
function pathWords(words) {
  if (basename(words[0] ?? '') === 'gh') return []
  return words.filter(
    (word, i) => !MESSAGE_FLAGS.has(words[i - 1]) && !/^(-m|--message=)/.test(word),
  )
}

/** Whether a git call writes files at paths that reach the folder, not merely names a branch that looks like it. */
function gitWrites(words, related) {
  const args = gitArgs(words)
  const verb = args.find((arg) => !arg.startsWith('-'))
  if (GIT_PATH_WRITES.has(verb)) return related.length > 0
  if (!GIT_PATH_OR_REF.has(verb)) return false
  const dashes = args.indexOf('--')
  if (dashes >= 0) return args.slice(dashes + 1).some((arg) => relation(arg) !== null)
  // Without `--`, a bare folder name could be a branch; a path below it or a glob cannot.
  return related.some(
    (word) => word.replace(/\/+$/, '').split('/').length > 2 || /[*?[]/.test(word),
  )
}

function readsOnly(words) {
  const tool = basename(words[0] ?? '')
  if (tool === 'git') return GIT_READ_ONLY.has(gitArgs(words).find((arg) => !arg.startsWith('-')))
  if (tool === 'find') return !words.some((word) => FIND_WRITES.has(word))
  if (tool === 'sed') return !words.some((word) => /^-[a-zA-Z]*i|^--in-place/.test(word))
  if (tool === 'awk') return !words.some((word) => word === 'inplace' || AWK_WRITES.test(word))
  return READ_ONLY.has(tool)
}

/** The refusal for a simple command that redirects its output into the folder, whatever the program. */
export function deniedRedirect(words) {
  return words.some(
    (word, i) => (word === '>' || word === '>>') && relation(words[i + 1] ?? '') !== null,
  )
    ? WHY
    : undefined
}

/**
 * The refusal for a simple command (its words, leading assignments and wrappers removed) that writes under the folder: a
 * redirect into it, a program that is not read-only on a path in it, or a destructive program on `evals` itself.
 */
export function deniedWrite(words) {
  const redirect = deniedRedirect(words)
  if (redirect) return redirect
  const related = pathWords(words).filter((word) => relation(word) !== null)
  if (related.length === 0) return undefined
  const tool = basename(words[0] ?? '')
  if (tool === 'git') return gitWrites(words, related) ? WHY : undefined
  if (readsOnly(words)) return undefined
  // Here the program is not read-only: on `evals` itself only a program that changes what it is given is refused.
  const inside = related.some((word) => relation(word) === 'inside')
  return inside || DESTRUCTIVE.has(tool) || READ_ONLY.has(tool) ? WHY : undefined
}

/** The label names a gh flag's value lists, such as `--add-label "a,owner-evals"` or `--label=owner-evals`. */
function labelsGiven(words) {
  return words.flatMap((word, i) => {
    const inline = /^(--add-label|--label)=(.*)$/.exec(word)?.[2]
    const value = LABEL_FLAGS.has(words[i - 1]) ? word : inline
    return value === undefined ? [] : value.split(',').map((name) => name.trim().toLowerCase())
  })
}

/** Whether a gh api call writes: another method than GET, or a field or input body. */
function apiWrites(words) {
  const method = words.findIndex((word) => word === '-X' || word === '--method')
  const named = method >= 0 && words[method + 1]?.toUpperCase() !== 'GET'
  const inline = words.some((word) => /^--method=/i.test(word) && !/=get$/i.test(word))
  return (
    named || inline || words.some((word) => API_FIELDS.has(word) || /^--(raw-)?field=/.test(word))
  )
}

/** The refusal for a gh call (`verbs` are its first two subcommands) that adds or creates the owner-evals label. */
export function deniedLabel(words, verbs) {
  const [group, action] = verbs
  if ((group === 'pr' || group === 'issue') && (action === 'edit' || action === 'create')) {
    return labelsGiven(words).includes(OWNER_EVALS_LABEL) ? WHY : undefined
  }
  if (group === 'label') {
    return words.some((word) => word.toLowerCase() === OWNER_EVALS_LABEL) ? WHY : undefined
  }
  if (group !== 'api' || !apiWrites(words)) return undefined
  // A write that names the label as a value, in a labels path or a labels field.
  const value = /(^|[=,/])owner-evals(,|$)/i
  const aimed = words.some((word) => /(^|\/)labels(\/|$|\?)|^labels(\[\])?=|^name=/.test(word))
  return aimed && words.some((word) => !/\s/.test(word) && value.test(word)) ? WHY : undefined
}
