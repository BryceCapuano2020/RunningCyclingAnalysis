import { posix } from 'node:path'
import { importsOf } from './imports.mjs'
import { withoutComments } from './scanSource.mjs'

/*
 * The layers of the repo as checks (docs/ARCHITECTURE.md, Layers). A rule names the files it covers, the imports they may not
 * make, and the fix, so a failure says what to do and not only what is wrong. Everything here works on a repo-relative path and
 * the source text, so boundaries.test.mjs can prove each rule fires on a synthetic snippet.
 */

export const isTestFile = (path) =>
  /\.(test|sim|perf|story)\.(ts|tsx)$/.test(path) || /(^|\/)test\//.test(path)

const isReact = (t) => /^(react|react-dom|@types\/react)(\/|$)/.test(t)
const isHono = (t) => /^hono(\/|$)/.test(t)
const isCloudflare = (t) => /^(wrangler|@cloudflare\/|cloudflare:)/.test(t)
const isApps = (t) => t.startsWith('apps/') || /^@rca\/(api|web)(\/|$)/.test(t)
const isApi = (t) => t.startsWith('apps/api/') || /^@rca\/api(\/|$)/.test(t)
const isWebApp = (t) => t.startsWith('apps/web/') || /^@rca\/web(\/|$)/.test(t)
const isContract = (t) => t.startsWith('packages/contract/') || /^@rca\/contract(\/|$)/.test(t)
const under = (prefix) => (t) => t.startsWith(prefix)
const WEB = 'apps/web/src/'

/** Where an import points: a repo-relative path without extension for a relative specifier, the bare specifier otherwise. */
export function targetOf(file, specifier) {
  if (!specifier.startsWith('.')) return specifier
  return posix.join(posix.dirname(file), specifier).replace(/\.(tsx?|mjs|js)$/, '')
}

/**
 * Import rules. `scope` picks the files, `tests` says whether test files are covered, `forbids` picks the targets. `allow` maps a
 * file (or, with `allowBy: 'target'`, a target) to the reason it is an exception; an entry nothing uses is reported as dead.
 */
export const IMPORT_RULES = [
  {
    id: 'core-is-the-bottom-layer',
    scope: under('packages/core/src/'),
    tests: true,
    forbids: (t) => isApps(t) || isContract(t) || isReact(t) || isHono(t) || isCloudflare(t),
    rule: 'packages/core imports no app, no contract, no React, no Hono and no Cloudflare package: it runs in the page, the worker and the server alike.',
    fix: 'Move the shared type or function down into packages/core, or pass the value in as an argument from the caller.',
    allow: new Map(),
  },
  {
    id: 'contract-is-wire-only',
    scope: under('packages/contract/src/'),
    tests: true,
    forbids: (t) => isApps(t) || isReact(t) || isHono(t) || isCloudflare(t),
    rule: 'packages/contract holds the wire format and imports only @rca/core, never an app, React, Hono or Cloudflare package.',
    fix: 'Keep the schema here and put anything that needs a framework in the app that uses it.',
    allow: new Map(),
  },
  {
    id: 'web-never-reads-api-internals',
    scope: under(WEB),
    tests: true,
    forbids: (t) => isApi(t) || isHono(t) || isCloudflare(t),
    rule: 'apps/web talks to the API over HTTP and shares code only through @rca/contract and @rca/core.',
    fix: 'Move what both apps need into packages/contract (a shape) or packages/core (a function), and import it from there.',
    allow: new Map([
      [
        'apps/web/src/worker/serverEquivalence.test.ts',
        'proves the page and the server compute the same results from the same inputs',
      ],
      [
        'apps/web/src/worker/serverEquivalence.lift.test.ts',
        'proves the page and the server compute the same lift results from the same inputs',
      ],
    ]),
  },
  {
    id: 'api-never-reads-web',
    scope: under('apps/api/src/'),
    tests: true,
    forbids: (t) => isWebApp(t) || isReact(t),
    rule: 'apps/api shares code with the web app only through @rca/contract and @rca/core.',
    fix: 'Move what both apps need into packages/contract (a shape) or packages/core (a function), and import it from there.',
    allow: new Map(),
  },
  {
    id: 'worker-stays-out-of-the-page',
    scope: under(`${WEB}worker/`),
    tests: false,
    forbids: (t) => isReact(t) || under(`${WEB}ui/`)(t),
    rule: 'The Web Worker code has no React and no page code: it runs where there is no DOM.',
    fix: 'Move the shared module out of src/ui into src/worker (or a neutral folder), and let the page import it from there.',
    allow: new Map(),
  },
  {
    id: 'page-reaches-worker-through-listed-modules',
    scope: (f) => f.startsWith(WEB) && !f.startsWith(`${WEB}worker/`),
    tests: false,
    forbids: under(`${WEB}worker/`),
    allowBy: 'target',
    rule: 'The page talks to the worker by messages (worker/protocol, sent from ui/analysis/workerTransport) and opens only the listed worker modules directly.',
    fix: 'Send a message through workerTransport. If the page must open a store the worker also uses, add that module to the list with a reason.',
    allow: new Map([
      [
        'apps/web/src/worker/importSummary',
        'the shape of the import summary the worker sends back',
      ],
      [
        'apps/web/src/worker/protocol',
        'the message types: the contract between the page and the worker',
      ],
      [
        'apps/web/src/worker/viewerZone',
        'hands the device zone to the calendar once, in the page and in the worker',
      ],
      [
        'apps/web/src/worker/outbox',
        'the page reads the saves still waiting in the browser database to warn on sign-out',
      ],
      [
        'apps/web/src/worker/stateStore',
        'the page opens the kept-results store directly to show and remember them',
      ],
      ['apps/web/src/worker/checkinKeeper', 'the page reads the check-in kept beside the state'],
      ['apps/web/src/worker/idb', 'the IndexedDB helpers the import record store uses'],
      [
        'apps/web/src/worker/openIndexedDb',
        'the best-effort database open the import record store uses',
      ],
      [
        'apps/web/src/worker/liftStore',
        'the lift log runs in the page against the browser lift store',
      ],
      ['apps/web/src/worker/liftSync', 'the lift log syncs from the page'],
      ['apps/web/src/worker/liftTransitions', 'the lift set states the page shows and changes'],
      [
        'apps/web/src/worker/liftCounts',
        'counts the lift rows in the browser, for the sign-out warning and the device copy',
      ],
      [
        'apps/web/src/worker/deleteAccountDetails',
        'account deletion clears the detail recordings from the page',
      ],
      [
        'apps/web/src/worker/forgetAccountDetails',
        'sign-out clears the detail recordings from the page',
      ],
      [
        'apps/web/src/worker/sweepAccountDetails',
        'clears the detail recordings of other accounts when the page starts',
      ],
    ]),
  },
  {
    id: 'web-leaf-folders-stay-below-the-page',
    scope: (f) => /^apps\/web\/src\/(api|domain|export|download)\//.test(f),
    tests: false,
    forbids: (t) => isReact(t) || under(`${WEB}ui/`)(t),
    rule: 'src/api, src/domain, src/export and src/download are below the page: they import no React and nothing from src/ui.',
    fix: 'Move the shared piece into the leaf folder (or src/domain) and let the page import it.',
    allow: new Map(),
  },
]

/** Calls and reads that make core depend on something other than its arguments. */
export const PURITY_RULES = [
  [/\bDate\.now\b/, 'Date.now', 'take the time as an argument from the caller'],
  [/\bnew\s+Date\s*\(\s*\)/, 'new Date()', 'take the time as an argument from the caller'],
  [/\bperformance\.now\b/, 'performance.now', 'take the clock reading as an argument'],
  [/\bMath\.random\b/, 'Math.random', 'take a seeded generator or the random value as an argument'],
  [
    /\bcrypto\.(randomUUID|getRandomValues)\s*\(/,
    'crypto randomness',
    'take the id or the bytes as an argument',
  ],
  [/(?<![.\w$])fetch\s*\(/, 'fetch()', 'do the request in the app and pass the answer in'],
  [
    /(?<![.\w$])(setTimeout|setInterval|setImmediate|queueMicrotask)\s*\(/,
    'a timer',
    'let the caller own the waiting and call core when it fires',
  ],
  [
    /(?<![.\w$])(localStorage|sessionStorage|indexedDB)\b/,
    'browser storage',
    'let the caller read and write storage and pass the values in',
  ],
  [
    /\.resolvedOptions\s*\(|\bprocess\.env\b/,
    'the environment (zone or variables)',
    'take the zone or the setting as an argument (the calendar holds the viewer zone)',
  ],
]

/** Non-test files in packages/core that break purity, each with the reason a reviewer accepts. */
export const PURITY_ALLOW = new Map([
  [
    'packages/core/src/session.ts',
    'the session clock defaults to the real time; the server sets it from the snapshot input, the web worker and about 330 tests rely on the default (smell: make the clock a constructor argument)',
  ],
])

const withoutStrings = (text) => text.replace(/(['"])(?:\\.|(?!\1)[^\\\n])*\1/g, (m) => m[0] + m[0])

/** What one file breaks: `{ rule, file, what, message }`. `rules` defaults to the real ones. */
export function violationsIn(file, source, rules = IMPORT_RULES) {
  const found = []
  const test = isTestFile(file)
  const imports = importsOf(source, { withTypes: true })
  for (const rule of rules) {
    if (!rule.scope(file) || (test && !rule.tests)) continue
    for (const { from } of imports) {
      const target = targetOf(file, from)
      if (!rule.forbids(target)) continue
      const key = rule.allowBy === 'target' ? target : file
      found.push({
        rule: rule.id,
        key,
        allowed: rule.allow,
        message: `${file} imports '${from}'. Rule ${rule.id}: ${rule.rule} Fix: ${rule.fix}`,
      })
    }
  }
  return found
}

/** Purity breaks in one core file; test files and test support folders are not covered. */
export function impuritiesIn(file, source) {
  if (!file.startsWith('packages/core/src/') || isTestFile(file)) return []
  const text = withoutStrings(withoutComments(source))
  return PURITY_RULES.filter(([pattern]) => pattern.test(text)).map(([, what, fix]) => ({
    rule: 'core-is-pure',
    key: file,
    allowed: PURITY_ALLOW,
    message: `${file} uses ${what}. Rule core-is-pure: packages/core is a pure function of its inputs, so one library gives one answer on every device and on the server. Fix: ${fix}.`,
  }))
}
