import type { ActivityRecord } from '@rca/contract'
import { digestActivity } from '@rca/core/digest'
import type { SyncItem } from '@rca/core/session'
import { sampleDataset } from '@rca/core/synthetic'
import { describe, expect, it } from 'vitest'
import { DeferredOriginals } from './deferredOriginals'

const [first, second, third] = sampleDataset().activities.map(digestActivity)

function entry(digest: typeof first, bytes = 10) {
  const record = { id: `rec-${digest!.id}`, digest } as unknown as ActivityRecord
  const item = {
    digest,
    fileName: 'f.fit',
    fileHash: 'h',
    bytes: new Uint8Array(bytes),
  } as SyncItem
  return { record, item }
}

function setup(over: { hidden?: string[]; budgetBytes?: number; fails?: string[] } = {}) {
  const uploaded: string[] = []
  const originals = new DeferredOriginals({
    upload: async (record) => {
      if (over.fails?.includes(record.id)) throw new Error('refused')
      uploaded.push(record.id)
    },
    hiddenNow: () => new Set(over.hidden ?? []),
    codeOf: () => 'storage-quota',
    ...(over.budgetBytes === undefined ? {} : { budgetBytes: over.budgetBytes }),
  })
  return { originals, uploaded }
}

describe('originals held until the import is read', () => {
  it('uploads nothing as they are added, and the shown copies once it is read', async () => {
    const { originals, uploaded } = setup()
    const a = entry(first)
    const b = entry(second)
    await originals.add(a.record, a.item)
    await originals.add(b.record, b.item)
    expect(uploaded).toEqual([])

    const failures = await originals.finish(new Set([second!.id]))

    expect(failures).toEqual([])
    expect(uploaded).toEqual([a.record.id])
  })

  it('says which uploads failed, by the activity’s key, and goes on with the rest', async () => {
    const a = entry(first)
    const b = entry(second)
    const { originals, uploaded } = setup({ fails: [a.record.id] })
    await originals.add(a.record, a.item)
    await originals.add(b.record, b.item)

    const failures = await originals.finish(new Set())

    expect(failures).toEqual([
      { key: expect.stringMatching(/^(run|ride)-\d+$/), code: 'storage-quota' },
    ])
    expect(uploaded).toEqual([b.record.id])
  })

  it('decides the oldest with the copies known so far when the bytes held pass the budget', async () => {
    const { originals, uploaded } = setup({ budgetBytes: 15, hidden: [second!.id] })
    const a = entry(first)
    const b = entry(second)
    const c = entry(third)

    await originals.add(a.record, a.item)
    expect(uploaded).toEqual([])
    // 20 bytes held: the oldest is decided now. It is shown, so it goes up.
    await originals.add(b.record, b.item)
    expect(uploaded).toEqual([a.record.id])
    // 20 again: the second is decided, and it is hidden as things stand, so it does not.
    await originals.add(c.record, c.item)
    expect(uploaded).toEqual([a.record.id])

    await originals.finish(new Set())
    expect(uploaded).toEqual([a.record.id, c.record.id])
  })

  it('holds nothing after finishing, so a second import starts clean', async () => {
    const { originals, uploaded } = setup()
    const a = entry(first)
    await originals.add(a.record, a.item)
    await originals.finish(new Set())
    await originals.finish(new Set())
    expect(uploaded).toEqual([a.record.id])
  })

  it('fails an original that can never be kept at once, and holds none of its bytes', async () => {
    const uploaded: string[] = []
    const originals = new DeferredOriginals({
      upload: async (record) => void uploaded.push(record.id),
      hiddenNow: () => new Set(),
      codeOf: () => 'server',
      refuse: (item) => (item.bytes.byteLength > 5 ? 'file-too-large' : null),
    })
    const big = entry(first, 10)
    const small = entry(second, 3)

    await originals.add(big.record, big.item)
    await originals.add(small.record, small.item)
    const failures = await originals.finish(new Set())

    expect(failures).toEqual([
      { key: expect.stringMatching(/^(run|ride)-\d+$/), code: 'file-too-large' },
    ])
    expect(uploaded).toEqual([small.record.id])
  })
})
