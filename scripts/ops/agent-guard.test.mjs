import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { decide, hookOutput } from './agent-guard.mjs'
import { simpleCommands } from './shell-words.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SLOT = '/repo/.claude/stage-d/testslot.sh'
const kind = (command, agent) => {
  const verdict = decide(command, agent)
  return verdict?.deny ? 'deny' : verdict?.ask ? 'ask' : 'allow'
}

test('splits commands on separators and keeps quoted text whole', () => {
  assert.deepEqual(simpleCommands('cd a && npx vitest run "x y" | tee out; echo done'), [
    ['cd', 'a'],
    ['npx', 'vitest', 'run', 'x y'],
    ['tee', 'out'],
    ['echo', 'done'],
  ])
  assert.deepEqual(simpleCommands(`git commit -m "run npx vitest; then gh pr checks"`), [
    ['git', 'commit', '-m', 'run npx vitest; then gh pr checks'],
  ])
})

test('skips here-document bodies and comments', () => {
  const text = "cat > notes.md <<'EOF'\nnpx vitest run\ngh pr checks 12\nEOF\necho ok # npx vitest"
  assert.deepEqual(simpleCommands(text), [
    ['cat', 'notes.md'],
    ['echo', 'ok'],
  ])
  assert.deepEqual(simpleCommands('grep x <<< "npx vitest"'), [['grep', 'x', 'npx vitest']])
})

test('test runs need a slot', () => {
  for (const command of [
    'npx vitest run packages/core',
    'cd apps/web && npx vitest run src/ui',
    'node_modules/.bin/vitest run',
    'npm test',
    'npm run test:perf -w @rca/core',
    'npm run -s test:sim',
    'npm --workspace @rca/web run e2e -- --workers=2',
    'npx playwright test e2e/a.spec.ts',
    'npm run verify:release',
    'npm run check',
    'CI=1 npx vitest run',
    'bash -lc "npx vitest run"',
  ]) {
    assert.equal(kind(command), 'deny', command)
  }
  for (const command of [
    `${SLOT} npx vitest run packages/core`,
    `cd apps/web && ${SLOT} npm run e2e -- --workers=2`,
    'npm run test:ops',
    'npm run test:deploy-config',
    'node --test scripts/ops/*.test.mjs',
    'npm run check:bundle',
    'npx playwright install chromium',
    'grep -rn vitest packages',
    'cat vitest.config.ts',
    'npm run typecheck',
  ]) {
    assert.equal(kind(command), 'allow', command)
  }
})

test('nobody polls CI', () => {
  for (const command of [
    'gh pr checks 412',
    'gh pr checks 412 --watch',
    'gh -R owner/repo pr checks 1',
    'gh run watch 123',
    'while true; do gh pr view 1; sleep 30; done',
    'until gh pr view 1 --json state | grep MERGED; do sleep 60; done',
    'watch -n 30 gh pr view 1',
  ]) {
    assert.equal(kind(command), 'deny', command)
  }
  for (const command of [
    'npm run pr:queue',
    'gh pr view 1 --json state',
    'gh run view 123 --log-failed',
    'for f in a b; do echo $f; done',
  ]) {
    assert.equal(kind(command), 'allow', command)
  }
})

test('only the coordinator marks ready and merges', () => {
  for (const command of ['gh pr ready 12', 'gh pr merge --auto --squash 12']) {
    assert.equal(kind(command), 'allow', command)
    assert.equal(kind(command, 'rca-builder'), 'deny', command)
    assert.equal(kind(command, 'general-purpose'), 'deny', command)
  }
  assert.equal(kind('gh pr create --draft --title x --body y', 'rca-builder'), 'allow')
  assert.equal(kind('git push -u origin feat/x', 'rca-builder'), 'allow')
})

test('the reviewer is read-only', () => {
  for (const command of ['git commit -m x', 'git -C wt push', 'gh pr comment 1 --body x']) {
    assert.equal(kind(command, 'rca-reviewer'), 'deny', command)
    assert.equal(kind(command, 'rca-builder'), 'allow', command)
  }
  assert.equal(kind('git -C wt diff origin/main...HEAD', 'rca-reviewer'), 'allow')
})

test('no push to main, no plain force-push, no stash', () => {
  for (const command of [
    'git push origin main',
    'git push origin HEAD:main',
    'git push --force origin feat/x',
    'git push -f origin feat/x',
    'git push origin +feat/x',
    'git stash',
    'git stash pop',
    'git -C wt stash push -m x',
  ]) {
    assert.equal(kind(command), 'deny', command)
  }
  for (const command of [
    'git push --force-with-lease origin feat/x',
    'git push origin feat/main-menu',
    'git stash list',
  ]) {
    assert.equal(kind(command), 'allow', command)
  }
})

test('production asks the owner in the main session and is refused to agents', () => {
  for (const command of [
    'npm run deploy:built -- --tag abc',
    'npx wrangler deploy',
    'npx wrangler d1 execute rca --remote --command "select 1"',
    'npx wrangler secret put KEY',
  ]) {
    assert.equal(kind(command), 'ask', command)
    assert.equal(kind(command, 'rca-builder'), 'deny', command)
  }
  assert.equal(kind('npx wrangler dev --local'), 'allow')
  assert.equal(kind('npx wrangler d1 migrations apply rca --local'), 'allow')
})

test('the hook answers Bash calls only, in the PreToolUse shape', () => {
  assert.equal(hookOutput({ tool_name: 'Read', tool_input: { file_path: 'x' } }), '')
  assert.equal(hookOutput({ tool_name: 'Bash', tool_input: { command: 'ls' } }), '')
  const out = JSON.parse(
    hookOutput({
      tool_name: 'Bash',
      tool_input: { command: 'gh pr ready 3' },
      agent_type: 'rca-builder',
    }),
  )
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse')
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny')
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /coordinator/)
})

test('every hook in .claude/settings.json runs a script that exists', () => {
  const settings = JSON.parse(readFileSync(join(ROOT, '.claude', 'settings.json'), 'utf8'))
  const commands = Object.values(settings.hooks).flatMap((groups) =>
    groups.flatMap((group) => group.hooks.map((hook) => hook.command)),
  )
  assert.ok(commands.length >= 3)
  for (const command of commands) {
    const script = command.match(/scripts\/ops\/[\w-]+\.mjs/)?.[0]
    assert.ok(script && existsSync(join(ROOT, script)), command)
  }
})
