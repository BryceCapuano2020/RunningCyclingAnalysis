import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { fillLandingOg, type LandingFigures } from '../src/ui/landingFigures.ts'

const VIRTUAL = 'virtual:landing-figures'
const WEB = fileURLToPath(new URL('..', import.meta.url))

/**
 * The landing figures, read from the sample's analysis. The config is bundled with the analysis left as plain
 * imports, which Node cannot load as TypeScript, so a child process under tsx runs it
 * (scripts/printLandingFigures.ts). It throws when the sample stops showing what the landing example describes,
 * which fails the build. The e2e tests read the same figures through it.
 */
export function sampleFigures(): LandingFigures {
  const out = execFileSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/printLandingFigures.ts'],
    { cwd: WEB, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 60_000 },
  )
  return JSON.parse(out) as LandingFigures
}

/**
 * `virtual:landing-figures`: the landing figures, made once when the build (or the test run, which loads the
 * same plugins) first asks for them. It also fills index.html's `%LANDING_OG_ALT%`. No script is injected, so
 * the page's strict policy is unchanged.
 */
export function landingFigures(): Plugin {
  let made: LandingFigures | null = null
  const get = () => (made ??= sampleFigures())
  return {
    name: 'rca-landing-figures',
    resolveId: (id) => (id === VIRTUAL ? `\0${VIRTUAL}` : null),
    load: (id) =>
      id === `\0${VIRTUAL}` ? `export const LANDING_EXAMPLE = ${JSON.stringify(get())}` : null,
    transformIndexHtml: { order: 'pre', handler: (html) => fillLandingOg(html, get()) },
  }
}
