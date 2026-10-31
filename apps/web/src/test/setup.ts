import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach } from 'vitest'
import { resetKeptPowerCache } from '../ui/keptPowerStore'

// Module state that outlives a test is reset here for every file, so no test depends on the order it runs in.
beforeEach(resetKeptPowerCache)
afterEach(resetKeptPowerCache)
