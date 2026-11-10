import { describe, expect, it } from 'vitest'
import { readStylesheet } from './ui/test/stylesheet'

const page = await readStylesheet(import.meta.url, '../privacy.html')
const store = await readStylesheet(import.meta.url, './worker/stateStore.ts')
const sweep = await readStylesheet(import.meta.url, './worker/sweepAccountDetails.ts')
const forget = await readStylesheet(import.meta.url, './worker/forgetAccountDetails.ts')
const remove = await readStylesheet(import.meta.url, './worker/deleteAccountDetails.ts')
const kept = await readStylesheet(import.meta.url, './ui/analysis/rememberKept.ts')
const text = page.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('the privacy page on the results copy (rca-state)', () => {
  it('names the database the store opens and what clears it', () => {
    expect(store).toContain("DB_NAME = 'rca-state'")
    expect(text).toContain('in a database named rca-state')
    expect(text).toContain('It is never uploaded')
    expect(text).toContain("Signing out and deleting your account clear the account's copy")
    expect(text).toContain('signing in as someone else clears the other account')
    expect(text).toContain('Nothing is written while you are looking at the sample')
  })

  it('is cleared where the page says it is', () => {
    expect(forget).toContain('clearSnapshot(userId)')
    expect(remove).toContain('clearSnapshot(userId)')
    expect(sweep).toContain('sweepSnapshots(keepUserId)')
    expect(kept).toContain('clearSnapshot(DEVICE_STATE_SCOPE)')
  })
})
