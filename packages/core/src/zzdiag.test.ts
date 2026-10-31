import { expect, it } from 'vitest'
import { AnalysisSession } from './session'
import { copiedLibrary } from './test/libraryFixture'

it('diag change', () => {
  const library = copiedLibrary(400, { hard: true })
  const session = new AnalysisSession()
  session.clock = () => Math.max(...library.map((digest) => digest.startMs))
  session.choosePeriod(42)
  const state = session.loadDigests(library, { massKg: 75, bikeMassKg: 9 })
  const calls = (['run', 'ride'] as const).map((sport) =>
    state.change![sport].map((c) =>
      [c.durationS, c.now, c.before, c.basis, c.observed, c.low, c.high, c.verdict].join(','),
    ),
  )
  const text = `DIAG|${process.platform}|${process.arch}|${process.version}|${calls.map((c) => c.join(';')).join('||')}|`
  if (process.env.CI) throw new Error(text)
  require('fs').writeFileSync('/tmp/diag-local.txt', text)
  expect(true).toBe(true)
})
