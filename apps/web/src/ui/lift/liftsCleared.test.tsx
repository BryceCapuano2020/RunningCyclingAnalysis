// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { announceLiftsCleared, onLiftsCleared } from './liftsCleared'

it('tells a listener in this tab, until it stops listening', () => {
  const heard = vi.fn()
  const stop = onLiftsCleared(heard)
  announceLiftsCleared()
  expect(heard).toHaveBeenCalledTimes(1)
  stop()
  announceLiftsCleared()
  expect(heard).toHaveBeenCalledTimes(1)
})
