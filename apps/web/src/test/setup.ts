import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach } from 'vitest'
import { resetKeptPowerCache } from '../ui/keptPowerStore'
import { resetMemoryLock } from '../worker/liftSync'

// Module state that outlives a test is reset here for every file, so no test depends on the order it runs in.
beforeEach(resetKeptPowerCache)
// jsdom has no navigator.locks, so lift flushes queue in liftSync's module: a test whose send never answers would hold it.
beforeEach(resetMemoryLock)
afterEach(resetKeptPowerCache)
