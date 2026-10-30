import { useEffect } from 'react'
import { focusPageHeading } from './pageHeading'

/*
 * A press whose button goes away with the state it changes leaves focus nowhere. The press asks for focus on the
 * page's heading, and the page, which outlives the button, moves it once the state has flipped, so the heading
 * that is there then (a headline may be a different element by then) is the one that takes it. The request is
 * one module-level flag, not a ref in the page: it belongs to no render, and it is dropped when the page changes.
 */
let requested = false

/** Asks for focus on the page heading once the page reports it has settled. Called from the press. */
export function askHeadingFocus(): void {
  requested = true
}

/**
 * Moves focus to the page heading when `settled` becomes true after a press asked for it. A request is dropped
 * when the page changes (the hash) or the page goes, so a press that changed nothing does not move focus at some
 * later flip.
 */
export function useHeadingFocusWhen(settled: boolean): void {
  useEffect(() => {
    if (!settled || !requested) return
    requested = false
    focusPageHeading()
  }, [settled])
  useEffect(() => {
    const drop = () => {
      requested = false
    }
    window.addEventListener('hashchange', drop)
    return () => {
      window.removeEventListener('hashchange', drop)
      drop()
    }
  }, [])
}
