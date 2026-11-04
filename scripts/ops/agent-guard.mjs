import { readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deniedLabel, deniedPath, deniedRedirect, deniedWrite } from './owner-evals-guard.mjs'
import { simpleCommands } from './shell-words.mjs'

// PreToolUse guard for Claude Code sessions in this repository (.claude/settings.json). It turns the
// rules in docs/PROCESS.md that prose kept failing to hold into refusals: tests run in a test slot,
// nobody polls CI, and only the coordinator (the main session) marks a pull request ready or merges.
// Subagents carry `agent_type` in the hook input; the main session does not.

const SLOT =
  'Run it through the test slot (.claude/stage-d/testslot.sh <command> in the main checkout)'
const SLOT_WHY =
  'so the shared machine stays near its core count (docs/PROCESS.md, Tests on the shared machine).'
const NO_POLL =
  'Never poll CI (docs/PROCESS.md). Run `npm run pr:queue` once; the app wakes the session on a failure.'

/** npm scripts that start vitest or Playwright, directly or through another script. */
const SLOTTED_SCRIPT = /^(test(?!:(ops|deploy-config)$)(:.*)?|e2e(:.*)?|verify:release|check)$/
/** npm scripts and wrangler calls that reach production. */
const DEPLOY_SCRIPT = /^deploy(:.*)?$/
const WRANGLER_REMOTE = new Set(['deploy', 'publish', 'secret', 'rollback', 'versions', 'triggers'])
/** Git subcommands a read-only reviewer never runs. */
const GIT_WRITES = new Set([
  'commit',
  'push',
  'reset',
  'rebase',
  'merge',
  'cherry-pick',
  'am',
  'revert',
])
const GH_PR_WRITES = new Set([
  'create',
  'edit',
  'comment',
  'review',
  'close',
  'reopen',
  'ready',
  'merge',
])
/** Words that only prefix the real command. */
const WRAPPERS = new Set(['env', 'time', 'nice', 'nohup', 'exec', 'command', 'caffeinate'])
const RESERVED = new Set(['do', 'then', 'else', 'elif', 'if', 'while', 'until', '!', '{', '}'])
const LOOPS = new Set(['while', 'until', 'for', 'watch'])

/** Options that take a value, per tool, so the value is not read as the subcommand. */
const NPM_VALUE_FLAGS = new Set(['-w', '--workspace', '--prefix', '-C'])
const GH_VALUE_FLAGS = new Set(['-R', '--repo'])
const GIT_VALUE_FLAGS = new Set(['-C', '-c'])

/** The command words without leading assignments, wrappers and shell keywords. */
export function core(words) {
  let i = 0
  for (;;) {
    const word = words[i]
    if (word === undefined) return []
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(word) || RESERVED.has(word)) i++
    else if (WRAPPERS.has(word)) {
      i++
      while (words[i]?.startsWith('-')) i += words[i] === '-n' ? 2 : 1
    } else if (word === 'timeout') i += 2
    else return words.slice(i)
  }
}

/** Positional words after the tool name, skipping its options and their values. */
function positionals(args, valueFlags) {
  const out = []
  for (let i = 0; i < args.length; i++) {
    if (valueFlags.has(args[i])) i++
    else if (!args[i].startsWith('-')) out.push(args[i])
  }
  return out
}

/** The npm script a command runs, or undefined. */
export function npmScript(words) {
  if (basename(words[0] ?? '') !== 'npm') return undefined
  const [verb, script] = positionals(words.slice(1), NPM_VALUE_FLAGS)
  if (['test', 't', 'tst'].includes(verb)) return 'test'
  if (['run', 'run-script', 'rum', 'urn'].includes(verb)) return script
  return undefined
}

/** Whether a command starts vitest or Playwright tests. */
export function startsTests(words) {
  const tool = basename(words[0] ?? '')
  if (tool === 'vitest') return true
  if (tool === 'playwright') return words[1] === 'test'
  if (tool === 'node') return /vitest\.mjs$|playwright\/cli\.js$/.test(words[1] ?? '')
  if (tool === 'npx' || (tool === 'npm' && ['exec', 'x'].includes(words[1]))) {
    let i = tool === 'npx' ? 1 : 2
    while (words[i]?.startsWith('-')) i += ['-p', '--package'].includes(words[i]) ? 2 : 1
    return startsTests(words.slice(i))
  }
  const script = npmScript(words)
  return script !== undefined && SLOTTED_SCRIPT.test(script)
}

function ghVerbs(words) {
  if (basename(words[0] ?? '') !== 'gh') return []
  return positionals(words.slice(1), GH_VALUE_FLAGS).slice(0, 2)
}

function reachesProduction(words) {
  const script = npmScript(words)
  if (script !== undefined && DEPLOY_SCRIPT.test(script)) return true
  const at = words.findIndex((word) => basename(word) === 'wrangler')
  if (at < 0) return false
  const args = words.slice(at + 1)
  return args.includes('--remote') || WRANGLER_REMOTE.has(positionals(args, new Set())[0])
}

function pushesMainOrForces(words) {
  if (
    basename(words[0] ?? '') !== 'git' ||
    positionals(words.slice(1), GIT_VALUE_FLAGS)[0] !== 'push'
  ) {
    return undefined
  }
  const refs = positionals(words.slice(words.indexOf('push') + 1), new Set(['-o', '--push-option']))
  const forced = words.some((word) => word === '--force' || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(word))
  if (forced || refs.slice(1).some((ref) => ref.startsWith('+'))) {
    return 'Force-push only with --force-with-lease, and never to main.'
  }
  const target = (ref) => ref.slice(ref.lastIndexOf(':') + 1).replace(/^refs\/heads\//, '')
  if (refs.slice(1).some((ref) => ['main', 'master'].includes(target(ref)))) {
    return 'Never push to main: open a pull request (docs/PROCESS.md).'
  }
  return undefined
}

/** Whether a subagent's gh call marks a pull request ready or merges it, by any route. */
function readiesOrMerges(words, verbs) {
  if (verbs[0] === 'pr') {
    if (verbs[1] === 'ready' || verbs[1] === 'merge') return true
    return verbs[1] === 'create' && !words.includes('--draft') && !words.includes('-d')
  }
  if (verbs[0] !== 'api') return false
  const text = words.join(' ')
  return /pulls\/\d+\/merge|enablePullRequestAutoMerge|markPullRequestReadyForReview|mergePullRequest/.test(
    text,
  )
}

/**
 * A sleep that waits on CI: inside a loop that calls gh or the queue, or a long one beside them.
 * Short sleeps in a loop that waits for a local server are fine.
 */
function pollsCi(words, { loop, callsGh }) {
  if (basename(words[0]) !== 'sleep') return false
  const seconds =
    Number.parseFloat(words[1] ?? '0') * ({ m: 60, h: 3600 }[words[1]?.slice(-1)] ?? 1)
  return callsGh && (loop || seconds >= 30)
}

/** One refusal for one simple command, or undefined. */
function judge(words, { agent, loop, callsGh }) {
  const verbs = ghVerbs(words)
  const ownerEvals = deniedWrite(words) ?? deniedLabel(words, verbs)
  if (ownerEvals) return { deny: ownerEvals }
  if (verbs[0] === 'pr' && verbs[1] === 'checks') return { deny: NO_POLL }
  if (verbs[0] === 'run' && verbs[1] === 'watch') return { deny: NO_POLL }
  if (pollsCi(words, { loop, callsGh })) return { deny: `No sleep loops on CI. ${NO_POLL}` }
  if (basename(words[0]) === 'watch') return { deny: `No watch loops. ${NO_POLL}` }
  const git = basename(words[0]) === 'git' ? positionals(words.slice(1), GIT_VALUE_FLAGS) : []
  if (git[0] === 'stash' && !['list', 'show'].includes(git[1])) {
    return {
      deny: 'Never use git stash: every worktree shares one stash stack. Make a WIP commit.',
    }
  }
  const push = pushesMainOrForces(words)
  if (push) return { deny: push }
  if (reachesProduction(words)) {
    const why = 'This reaches production, which needs the owner to ask (CLAUDE.md).'
    return agent ? { deny: `${why} Report it to the coordinator.` } : { ask: why }
  }
  if (agent && readiesOrMerges(words, verbs)) {
    return {
      deny: 'Only the coordinator marks a pull request ready or sets auto-merge, after review. Open it as a draft, leave it a draft and report.',
    }
  }
  if (agent === 'rca-reviewer') {
    const gitVerb =
      basename(words[0]) === 'git' ? positionals(words.slice(1), GIT_VALUE_FLAGS)[0] : ''
    if (GIT_WRITES.has(gitVerb) || (verbs[0] === 'pr' && GH_PR_WRITES.has(verbs[1]))) {
      return { deny: 'The reviewer is read-only: report findings instead.' }
    }
  }
  if (startsTests(words)) return { deny: `${SLOT}, ${SLOT_WHY}` }
  return undefined
}

/** The guard's answer for one Bash command: { deny } or { ask } with a reason, or undefined. */
export function decide(command, agent) {
  const commands = simpleCommands(command)
  const loop = commands.some((words) => LOOPS.has(basename(words[0] ?? '')))
  const callsGh = commands.some((words) => {
    const cmd = core(words)
    return basename(cmd[0] ?? '') === 'gh' || npmScript(cmd) === 'pr:queue'
  })
  for (const words of commands) {
    const redirect = deniedRedirect(words)
    if (redirect) return { deny: redirect }
    const cmd = core(words)
    if (!cmd.length || basename(cmd[0]) === 'testslot.sh') continue
    const shell = ['bash', 'sh', 'zsh'].includes(basename(cmd[0]))
    const flag = shell ? cmd.findIndex((word) => /^-[a-z]*c$/.test(word)) : -1
    const verdict =
      flag > 0 && cmd[flag + 1] !== undefined
        ? decide(cmd[flag + 1], agent)
        : judge(cmd, { agent, loop, callsGh })
    if (verdict) return verdict
  }
  return undefined
}

/** The guard's answer for an Edit, Write or NotebookEdit: { deny } for the owner's evals, else undefined. */
function decideEdit(input) {
  const target = input.tool_input?.file_path ?? input.tool_input?.notebook_path
  const reason = deniedPath(target, input.cwd)
  return reason ? { deny: reason } : undefined
}

/** The hook's stdout for a PreToolUse input, or '' to let the call through. */
export function hookOutput(input) {
  const command = input.tool_input?.command
  const verdict =
    input.tool_name === 'Bash' && typeof command === 'string'
      ? decide(command, input.agent_type)
      : ['Edit', 'Write', 'NotebookEdit'].includes(input.tool_name)
        ? decideEdit(input)
        : undefined
  if (!verdict) return ''
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: verdict.deny ? 'deny' : 'ask',
      permissionDecisionReason: verdict.deny ?? verdict.ask,
    },
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // A guard that cannot read its input lets the call through rather than blocking every command.
  try {
    const out = hookOutput(JSON.parse(readFileSync(0, 'utf8')))
    if (out) console.log(out)
  } catch (error) {
    console.error(`agent-guard skipped: ${error.message}`)
  }
}
