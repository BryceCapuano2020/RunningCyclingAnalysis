import { createElement, lazy } from 'react'
import type { ComponentProps, ComponentType } from 'react'
import type { ActivityPage as ActivityPageComponent } from './pages/ActivityPage'
import type { HistoryPage as HistoryPageComponent } from './pages/HistoryPage'
import type { RailedLiftPage as LiftPageComponent } from './lift/RailedLiftPage'
import type { MethodPage as MethodPageComponent } from './pages/MethodPage'
import type { ProfilePage as ProfilePageComponent } from './pages/ProfilePage'
import type { ResultPage as ResultPageComponent } from './pages/ResultPage'

const resets = new Set<() => void>()

/** Lets every page that has not loaded try its import again, after a load failed. */
export function retryPages(): void {
  for (const reset of resets) reset()
}

/**
 * The pages that are not the landing page, loaded when they are first needed. The landing page and
 * the restoring page stay in the main bundle: they are what a first visit and a reload show.
 *
 * A page that has been loaded renders directly, so it never suspends again. A page that was preloaded
 * is in that state before the visitor reaches it, so the common flows show no loading state at all.
 */
export function lazyPage<Props extends object>(load: () => Promise<ComponentType<Props>>) {
  let loaded: ComponentType<Props> | null = null
  const read = async () => {
    loaded = await load()
    return loaded
  }
  // React.lazy keeps a rejected import for good, so a failed load needs a fresh one to be tried again.
  const fresh = () => lazy(async () => ({ default: await read() }))
  let Lazy = fresh()
  function Page(props: Props) {
    const Component = loaded ?? Lazy
    return createElement(Component, props)
  }
  resets.add(() => {
    if (loaded === null) Lazy = fresh()
  })
  return { Page, preload: async () => void (loaded ?? (await read())) }
}

const result = lazyPage<ComponentProps<typeof ResultPageComponent>>(() =>
  import('./pages/ResultPage').then((module) => module.ResultPage),
)
// The History tab's charts are the heaviest part of the result pages and nobody needs them on Balance, so they are
// their own chunk, loaded when the tab is first opened (inside the result page, under its loading status).
const history = lazyPage<ComponentProps<typeof HistoryPageComponent>>(() =>
  import('./pages/HistoryPage').then((module) => module.HistoryPage),
)
// One activity's workbench (intervals, channels, laps) opens from a click on a list row, so it is its own chunk too.
const activity = lazyPage<ComponentProps<typeof ActivityPageComponent>>(() =>
  import('./pages/ActivityPage').then((module) => module.ActivityPage),
)
// Profile stands in the shell with the rail once there is a result (RailedProfilePage).
const profile = lazyPage<ComponentProps<typeof ProfilePageComponent>>(() =>
  import('./pages/RailedProfilePage').then((module) => module.RailedProfilePage),
)
const method = lazyPage<ComponentProps<typeof MethodPageComponent>>(() =>
  import('./pages/MethodPage').then((module) => module.MethodPage),
)
const lift = lazyPage<ComponentProps<typeof LiftPageComponent>>(() =>
  import('./lift/RailedLiftPage').then((module) => module.RailedLiftPage),
)

export const ResultPage = result.Page
export const HistoryPage = history.Page
export const ActivityPage = activity.Page
export const ProfilePage = profile.Page
export const MethodPage = method.Page
export const LiftPage = lift.Page

/**
 * Starts loading the pages a visitor reaches once they have results, in parallel with the analysis
 * that makes them. A failed load is left to the page, which asks again when it renders.
 */
export function preloadResultPages(): void {
  void result.preload().catch(() => undefined)
}

/** Loads every page now, for tests that render a page the moment its route is chosen. */
export async function preloadAllPages(): Promise<void> {
  await Promise.all([
    result.preload(),
    history.preload(),
    activity.preload(),
    profile.preload(),
    method.preload(),
    lift.preload(),
  ])
}
