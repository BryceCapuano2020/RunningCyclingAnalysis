import { digestActivity } from '@rca/core/digest'
import { AnalysisSession } from '@rca/core/session'
import { sampleDataset } from '@rca/core/synthetic'
import type { ActivityRecord } from '@rca/contract'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryDeviceLibrary } from '../test/deviceLibrary.fake'
import { renameRequest, type RenameContext } from './renameRequest'

const rename = vi.hoisted(() => vi.fn())
vi.mock('../api/renameClient', () => ({ renameActivity: rename }))

const SETTINGS = { massKg: 75, bikeMassKg: 9 }
const [activity] = sampleDataset().activities
if (activity === undefined) throw new Error('The sample has no activities')
const DIGEST = digestActivity(activity)

function context(over: Partial<RenameContext> = {}): RenameContext {
  return {
    session: new AnalysisSession(),
    deviceLibrary: memoryDeviceLibrary(),
    device: { epochNow: () => null, report: async () => {} },
    savedRecords: new Map(),
    view: { activeScope: null },
    reportLibrary: vi.fn(),
    ...over,
  }
}

function record(): ActivityRecord {
  return {
    id: 'saved-1',
    fileName: 'a.fit',
    hasFile: false,
    fileSize: null,
    createdAt: 1,
    digest: DIGEST,
  }
}

function names(state: { library: { name: string }[] }) {
  return state.library.map((a) => a.name)
}

beforeEach(() => {
  rename.mockReset()
})

describe('renaming in the account', () => {
  it('asks the server, then shows the name it answers with', async () => {
    rename.mockResolvedValue({ name: 'Club loop' })
    const ctx = context({
      savedRecords: new Map([['saved-1', record()]]),
      view: { activeScope: { kind: 'account', userId: 'u1' } },
    })
    const state = await renameRequest(ctx, {
      id: 'saved-1',
      name: '  Club loop ',
      userId: 'u1',
      settings: SETTINGS,
    })
    expect(rename).toHaveBeenCalledWith('saved-1', '  Club loop ', 'u1')
    expect(names(state)).toEqual(['Club loop'])
    expect(ctx.savedRecords.get('saved-1')?.digest.name).toBe('Club loop')
    expect(ctx.reportLibrary).toHaveBeenCalled()
  })

  it('changes nothing when the server refuses', async () => {
    rename.mockImplementation(async () => {
      throw new Error('Too many')
    })
    const ctx = context({
      savedRecords: new Map([['saved-1', record()]]),
      view: { activeScope: { kind: 'account', userId: 'u1' } },
    })
    await expect(
      renameRequest(ctx, { id: 'saved-1', name: 'X', userId: 'u1', settings: SETTINGS }),
    ).rejects.toThrow('Too many')
    expect(ctx.savedRecords.get('saved-1')?.digest.name).toBe(DIGEST.name)
  })

  it('asks for a reload when the library on screen is not this account, or does not hold the activity', async () => {
    const other = context({ view: { activeScope: { kind: 'device' } } })
    await expect(
      renameRequest(other, { id: 'saved-1', name: 'X', userId: 'u1', settings: SETTINGS }),
    ).rejects.toThrow('Reload your library')
    const empty = context({ view: { activeScope: { kind: 'account', userId: 'u1' } } })
    await expect(
      renameRequest(empty, { id: 'saved-1', name: 'X', userId: 'u1', settings: SETTINGS }),
    ).rejects.toThrow('Reload your library')
    expect(rename).not.toHaveBeenCalled()
  })
})

describe('renaming in this browser', () => {
  it('writes the name to the kept library and shows it', async () => {
    const ctx = context()
    await ctx.deviceLibrary.put('run-1', DIGEST)
    const state = await renameRequest(ctx, {
      id: 'run-1',
      name: 'Club loop',
      userId: null,
      settings: SETTINGS,
    })
    expect(rename).not.toHaveBeenCalled()
    expect(names(state)).toEqual(['Club loop'])
    expect((await ctx.deviceLibrary.get('run-1'))?.name).toBe('Club loop')
  })

  it('says so when the workout is no longer kept', async () => {
    await expect(
      renameRequest(context(), { id: 'run-1', name: 'X', userId: null, settings: SETTINGS }),
    ).rejects.toThrow('no longer kept')
  })
})
