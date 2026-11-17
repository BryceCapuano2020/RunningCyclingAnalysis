import { useEffect, useRef } from 'react'
import { PAGE_RULES } from './pageRules'
import { canonicalHash, hrefFor } from './route'
import type { Route } from './route'

/** What a deep link to a page without a result says: the page needs the visitor's files. */
export const COLD_NOTICE = 'Add your files to see this page.'

/** Whether the page shows only from a result. PAGE_RULES says which pages show without one. */
export function needsResult(route: Route): boolean {
  return PAGE_RULES[route.page].needsResult
}

export interface RouteGuardInput {
  route: Route
  hasResult: boolean
  /** A library is there (held digests, saved activities) though no result is, so the page is not cold. */
  libraryPresent?: boolean
  /** Work is running or waiting, which includes a library load. */
  busy: boolean
  /** An import is queued behind a library load. */
  waiting: boolean
  /** The signed-in library is loading. It holds the page busy, but it is not an import. */
  libraryLoading: boolean
  /** A kept library is being restored, which may still bring the result. */
  restoring: boolean
  /** The account and the library have answered, so the landing page is the true state. */
  settled: boolean
}

/** The notice for a deep link that has no result to show, or null when there is nothing to say. */
export function coldNoticeFor({
  route,
  hasResult,
  libraryPresent = false,
  busy,
  restoring,
  settled,
}: Pick<
  RouteGuardInput,
  'route' | 'hasResult' | 'libraryPresent' | 'busy' | 'restoring' | 'settled'
>): string | null {
  return !hasResult && !libraryPresent && !busy && !restoring && settled && needsResult(route)
    ? COLD_NOTICE
    : null
}

export interface GuardMemory {
  coldPage: Route['page'] | null
  wasImporting: boolean
  wasBusy: boolean
}

export const NO_GUARD_MEMORY: GuardMemory = { coldPage: null, wasImporting: false, wasBusy: false }

export const libraryLoadHolds = (status: string, reading: boolean) =>
  status === 'loading' || reading

export function guardStep(
  memory: GuardMemory,
  { route, hasResult, busy, waiting, libraryLoading }: GuardStepInput,
): { memory: GuardMemory; toBalance: boolean } {
  // A library load also holds the page busy, so busy is an import only when no load is running. A
  // visitor's own import during a kept library's restore is an import, and moves them to Balance.
  const importing = waiting || (busy && !libraryLoading)
  const busyCarriesOn = memory.wasBusy && !waiting
  const began = importing && !memory.wasImporting && !busyCarriesOn
  let coldPage = memory.coldPage
  // Only an import that began on the page moves the visitor: one who went there while an import ran chose it, and stays.
  if (began && !hasResult && needsResult(route)) coldPage = route.page
  else if (coldPage !== null && coldPage !== route.page) coldPage = null
  const arrived = hasResult && coldPage !== null
  return {
    memory: { coldPage: arrived ? null : coldPage, wasImporting: importing, wasBusy: busy },
    toBalance: arrived && needsResult(route),
  }
}

type GuardStepInput = Pick<
  RouteGuardInput,
  'route' | 'hasResult' | 'busy' | 'waiting' | 'libraryLoading'
>

/**
 * Keeps the address honest. An unknown hash is replaced with Balance's. A deep link to a page with
 * no result stays, with a notice saying what it needs. An import that brings a result from there
 * moves the visitor to Balance, the home page, rather than to the page the link named. Returns the
 * notice to show.
 */
export function useRouteGuard(input: RouteGuardInput): string | null {
  const { route, hasResult, busy, waiting, libraryLoading } = input
  // The page a deep link opened on when its import began, while it brings no result; null once the visitor has gone elsewhere.
  const memory = useRef<GuardMemory>(NO_GUARD_MEMORY)

  useEffect(() => {
    const hash = window.location.hash
    const canonical = canonicalHash(hash)
    if (canonical !== hash) window.location.replace(canonical)
  })

  useEffect(() => {
    const step = guardStep(memory.current, { route, hasResult, busy, waiting, libraryLoading })
    memory.current = step.memory
    if (step.toBalance) window.location.replace(hrefFor({ page: 'balance' }))
  })

  return coldNoticeFor({
    route,
    hasResult,
    libraryPresent: input.libraryPresent,
    busy,
    restoring: input.restoring,
    settled: input.settled,
  })
}
