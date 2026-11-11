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

  it('says what the server-authority design does with signed-in results, and that signed out analysis stays in the browser', () => {
    expect(text).toContain('Signed out, analysis runs in your browser and files are not uploaded')
    expect(text).toContain(
      'Signed in, the server computes your results from the activity summaries it holds, stores them with your account and deletes them with it, and this browser keeps a copy',
    )
    expect(text).toContain('Your results, signed in: the server computes them from the summaries')
    expect(text).toContain(
      'your logged lift sets and the check-in against your last import, which are part of them',
    )
    expect(text).toContain('Signed out, analysis runs in your browser and nothing is sent')
    expect(text).not.toContain('enabled for')
    expect(text).not.toContain('analysis catches up')
    expect(text).not.toContain('works them out again')
  })

  it('is cleared where the page says it is', () => {
    expect(forget).toContain('clearSnapshot(userId)')
    expect(remove).toContain('clearSnapshot(userId)')
    expect(sweep).toContain('sweepSnapshots(keepUserId)')
    expect(kept).toContain('clearSnapshot(DEVICE_STATE_SCOPE)')
  })
})
