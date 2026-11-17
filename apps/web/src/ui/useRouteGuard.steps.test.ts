import { describe, expect, it } from 'vitest'
import { guardStep, libraryLoadHolds, NO_GUARD_MEMORY } from './useRouteGuard'
import type { Route } from './route'

interface Render {
  route: Route
  hasResult?: boolean
  importing?: boolean
  reading?: boolean
}

/** The guard after each render of a signed-in tab with a loaded library: whether any render sent the visitor to Balance. */
function sentToBalance(renders: readonly Render[]): boolean {
  let memory = NO_GUARD_MEMORY
  let sent = false
  for (const { route, hasResult = false, importing = false, reading = false } of renders) {
    const step = guardStep(memory, {
      route,
      hasResult,
      busy: importing || reading,
      waiting: false,
      libraryLoading: libraryLoadHolds('loaded', reading),
    })
    memory = step.memory
    sent ||= step.toBalance
  }
  return sent
}

const activity: Route = { page: 'activity', id: 'a' }
const list: Route = { page: 'activities' }

describe('guardStep with a library read during an import', () => {
  // The shortest trace the model in ui/analysis/flowModel.ts found.
  it('leaves a visitor who moved away during the import where they are', () => {
    const renders: Render[] = [
      { route: activity },
      { route: activity, importing: true },
      { route: activity, importing: true, reading: true },
      { route: list, importing: true, reading: true },
      { route: list, importing: true },
      { route: list, importing: true, hasResult: true },
    ]
    expect(sentToBalance(renders)).toBe(false)
  })

  it('still moves a visitor who stayed on the page the import began on', () => {
    const renders: Render[] = [
      { route: list },
      { route: list, importing: true },
      { route: list, importing: true, reading: true },
      { route: list, importing: true },
      { route: list, importing: true, hasResult: true },
    ]
    expect(sentToBalance(renders)).toBe(true)
  })

  it('takes no read for an import, before or after it', () => {
    const renders: Render[] = [
      { route: list },
      { route: list, reading: true },
      { route: list },
      { route: list, hasResult: true },
    ]
    expect(sentToBalance(renders)).toBe(false)
  })
})
