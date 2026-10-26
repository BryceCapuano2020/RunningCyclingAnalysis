import { act } from '@testing-library/react'

/**
 * Gives the window a width, and lets a test resize it. Each media query of the form (max-width: N px)
 * matches at that width and fires its change listeners on a resize, as a browser does.
 */
export function viewportAt(width: number) {
  let current = width
  const listeners = new Set<() => void>()
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      get matches() {
        return current <= Number(/max-width:\s*(\d+)px/.exec(query)?.[1] ?? Infinity)
      },
      media: query,
      addEventListener: (_type: string, listener: () => void) => {
        listeners.add(listener)
      },
      removeEventListener: (_type: string, listener: () => void) => {
        listeners.delete(listener)
      },
    }),
  })
  return {
    resize(next: number) {
      current = next
      act(() => {
        for (const listener of listeners) listener()
      })
    },
  }
}

/** Removes the window's media queries, as a test or a worker has none. */
export function noMatchMedia() {
  Reflect.deleteProperty(window, 'matchMedia')
}
