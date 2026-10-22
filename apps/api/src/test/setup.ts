import { afterAll, beforeAll, beforeEach } from 'vitest'
import { resetTestEnv, startTestEnv, stopTestEnv } from './harness.ts'

beforeAll(startTestEnv, 60_000)
beforeEach(resetTestEnv)
afterAll(stopTestEnv)
