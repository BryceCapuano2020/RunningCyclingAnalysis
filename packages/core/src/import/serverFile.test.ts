import { describe, expect, it } from 'vitest'
import { encodeFit } from '../fit'
import { encodeGpx } from '../gpx/encode'
import { MIB } from '../constants'
import { sha256Hex } from '../sha256'
import { sampleDataset } from '../synthetic'
import { hashedFileName } from './minimise'
import { createBodiesOfFile } from './serverFile'

const run = sampleDataset().activities.find((activity) => activity.sport === 'run')!

describe('createBodiesOfFile', () => {
  it('gives one create body per activity, minimised, with the hash of the bytes', async () => {
    const bytes = encodeFit(run, { gps: true })
    const result = await createBodiesOfFile(bytes, 'garmin-123.fit')
    if (!result.ok) throw new Error(result.reason)
    expect(result.bodies).toHaveLength(1)
    const body = JSON.parse(result.bodies[0]!) as {
      fileHash: string
      fileName: string
      digest: { sport: string; startMs: number }
    }
    expect(body?.fileHash).toBe(await sha256Hex(bytes))
    expect(body?.fileName).toBe(hashedFileName('garmin-123.fit'))
    expect(body?.digest.sport).toBe('run')
    expect(body?.digest.startMs).toBe(run.startMs)
  })

  it('refuses a file that is not FIT, as the server reads nothing else', async () => {
    const result = await createBodiesOfFile(encodeGpx(run), 'garmin-1.gpx')
    expect(result.ok).toBe(false)
  })

  it('refuses a file over the server limit, 5 MiB', async () => {
    const result = await createBodiesOfFile(new Uint8Array(5 * MIB + 1), 'garmin-2.fit')
    expect(result).toMatchObject({ ok: false, code: 'too-large' })
  })

  it('refuses bytes that are not a FIT file with the parser reason', async () => {
    const result = await createBodiesOfFile(new Uint8Array(64), 'garmin-3.fit')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason.length).toBeGreaterThan(0)
  })
})
