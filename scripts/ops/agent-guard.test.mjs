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
    ['cat', '>', 'notes.md'],
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
    'nice -n 10 npx vitest run',
    'node node_modules/vitest/vitest.mjs run',
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
    'sleep 60 && gh run list --branch main',
    'for i in 1 2 3; do npm run pr:queue; sleep 5; done',
  ]) {
    assert.equal(kind(command), 'deny', command)
  }
  for (const command of [
    'npm run pr:queue',
    'gh pr view 1 --json state',
    'gh run view 123 --log-failed',
    'for f in a b; do echo $f; done',
    'for i in $(seq 30); do curl -s localhost:8787 && break; sleep 1; done',
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
  assert.equal(kind('gh pr create --title x --body y', 'rca-builder'), 'deny')
  assert.equal(kind('gh pr create --title x --body y'), 'allow')
  assert.equal(kind('gh api -X PUT repos/o/r/pulls/7/merge', 'rca-builder'), 'deny')
  assert.equal(
    kind("gh api graphql -f query='mutation { enablePullRequestAutoMerge }'", 'rca-gate'),
    'deny',
  )
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
    'git push origin HEAD:refs/heads/main',
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
    'git push origin feature/main',
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

test('no session writes the owner’s evals, by any shell route', () => {
  for (const agent of [undefined, 'rca-builder', 'rca-reviewer']) {
    for (const command of [
      'rm evals/owner-caught/lean-vs-ride-as-a-run/twin.test.ts',
      'echo x > evals/owner-caught/README.md',
      'cat notes >> "./evals/owner-caught/RUBRIC.md"',
      'cat x 2>evals/owner-caught/log',
      "awk '{print}' in > evals/owner-caught/x",
      `${SLOT} npx vitest run > evals/owner-caught/log`,
      'sed -i "" s/a/b/ evals/owner-caught/RUBRIC.md',
      'cd evals/owner-caught && ls',
      'cp /tmp/x /repo/evals/owner-caught/case.md',
      'tee evals/owner-caught/x < /dev/null',
      'git checkout -- evals/owner-caught',
      'git checkout HEAD evals/owner-caught/case.md',
      'git restore evals/owner-caught',
      'git rm -r evals/owner-caught',
      'git clean -fd evals/owner-caught',
      'find evals/owner-caught -delete',
      'find evals/owner-caught -exec rm {} ;',
      'FOO=1 bash -c "touch evals/owner-caught/new"',
      // The parent, a glob into the folder, a ./ prefix and an absolute path.
      'rm -rf evals',
      'rm -rf ./evals/',
      'mv evals /tmp/x',
      'find evals -delete',
      'sed -i "" s/a/b/ evals/*/case.md',
      'rm evals/*/case.md',
      'rm ./evals/owner-caught',
      'rm /Users/me/repo/evals/owner-caught/case.md',
      'rm ev*/owner-*/case.md',
      'awk \'{print > "x"}\' evals/owner-caught/case.md',
    ]) {
      assert.equal(kind(command, agent), 'deny', command)
    }
  }
})

test('reading the owner’s evals is fine, and so is naming their branch', () => {
  for (const command of [
    'cat evals/owner-caught/README.md',
    'head -20 evals/owner-caught/RUBRIC.md',
    'grep -rn hedge evals/owner-caught | wc -l',
    'rg anchor evals/owner-caught',
    'ls -la evals/owner-caught',
    'ls evals',
    'find evals/owner-caught -name case.md',
    'diff evals/owner-caught/a evals/owner-caught/b',
    'sed -n 1,5p evals/owner-caught/README.md',
    "awk '{print $1}' evals/owner-caught/case.md",
    "awk '$1 > 5' evals/owner-caught/case.md",
    'git diff origin/main -- evals/owner-caught',
    'git -C /repo log --oneline -- evals/owner-caught',
    'git show HEAD:evals/owner-caught/README.md',
    'git status evals/owner-caught',
    'git blame evals/owner-caught/RUBRIC.md',
    'git grep -n anchor -- evals/owner-caught',
    'git push origin evals/owner-caught',
    'git push -u origin evals/owner-caught-guards',
    'git checkout evals/owner-caught',
    'git rebase origin/main evals/owner-caught',
    'git switch -c evals/owner-caught-guards origin/main',
    'git add evals/owner-caught',
    `${SLOT} npx vitest run --project evals`,
    'npx prettier --check evals',
    'git commit -m "Pin the anchor in evals/owner-caught"',
    'gh pr create --draft --body "Adds evals/owner-caught -> owner-evals"',
    'echo "the lead -> evals/owner-caught is the owner’s"',
    'echo ok > docs/note.md',
  ]) {
    assert.equal(kind(command), 'allow', command)
  }
})

test('only the label value owner-evals is the owner’s to apply', () => {
  for (const command of [
    'gh pr edit 5 --add-label owner-evals',
    'gh pr edit 5 --add-label "bug,owner-evals"',
    'gh pr edit 5 --add-label=owner-evals',
    'gh pr create --draft --label owner-evals --title x',
    'gh issue edit 5 --add-label owner-evals',
    'gh label create owner-evals --color ff0000',
    'gh -R owner/repo label create owner-evals',
    'gh api repos/o/r/issues/5/labels -f "labels[]=owner-evals"',
    'gh api -X POST repos/o/r/issues/5/labels --field labels[]=owner-evals',
    'gh api --method=POST repos/o/r/labels -f name=owner-evals',
  ]) {
    for (const agent of [undefined, 'rca-builder']) {
      assert.equal(kind(command, agent), 'deny', command)
    }
  }
  for (const command of [
    'gh pr list --label owner-evals',
    'gh pr edit 5 --add-label integration',
    'gh pr edit 5 --body "Needs the owner-evals label from the owner"',
    'gh pr create --draft --body "Adds owner-evals checks"',
    'git commit -m "Refuse the owner-evals label"',
    'gh api repos/o/r/issues/5/labels',
    'gh api repos/o/r/issues/5/labels --jq ".[].name" # owner-evals',
    'gh api -X POST repos/o/r/issues/5/comments -f "body=ask for owner-evals"',
  ]) {
    assert.equal(kind(command), 'allow', command)
  }
})

test('Edit, Write and NotebookEdit are refused under evals/owner-caught and nowhere else', () => {
  const ask = (tool_name, tool_input, extra = {}) =>
    hookOutput({ tool_name, tool_input, cwd: '/repo/.claude/worktrees/w', ...extra })
  for (const [tool, input] of [
    ['Edit', { file_path: '/repo/evals/owner-caught/RUBRIC.md' }],
    ['Write', { file_path: '/repo/.claude/worktrees/w/evals/owner-caught/x/case.md' }],
    ['Write', { file_path: 'evals/owner-caught/x/case.md' }],
    ['Edit', { file_path: 'evals/owner-caught/../owner-caught/README.md' }],
    ['NotebookEdit', { notebook_path: '/repo/evals/owner-caught/a.ipynb' }],
  ]) {
    for (const agent_type of [undefined, 'rca-builder']) {
      const out = JSON.parse(ask(tool, input, { agent_type }))
      assert.equal(out.hookSpecificOutput.permissionDecision, 'deny', JSON.stringify(input))
      assert.match(out.hookSpecificOutput.permissionDecisionReason, /owner/)
    }
  }
  for (const [tool, input] of [
    ['Edit', { file_path: '/repo/evals/vitest.config.ts' }],
    ['Write', { file_path: '/repo/evals/owner-caught-notes.md' }],
    ['Edit', { file_path: '/repo/docs/evals/owner-caught.md' }],
    ['Write', { file_path: '/repo/apps/web/src/a.ts' }],
    ['Edit', {}],
  ]) {
    assert.equal(ask(tool, input), '', JSON.stringify(input))
  }
})

test('the hook is installed for the tools it guards', () => {
  const settings = JSON.parse(readFileSync(join(ROOT, '.claude', 'settings.json'), 'utf8'))
  const matcher = settings.hooks.PreToolUse.find((group) =>
    group.hooks.some((hook) => hook.command.includes('agent-guard.mjs')),
  ).matcher
  assert.deepEqual(matcher.split('|').sort(), ['Bash', 'Edit', 'NotebookEdit', 'Write'])
})
