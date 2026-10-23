import {
  MAX_GLOBAL_R2_STANDARD_OPERATIONS,
  MAX_GLOBAL_R2_WRITE_BYTES,
  MAX_MONTHLY_R2_PUT_BYTES,
  MIN_GLOBAL_R2_PUT_CHARGE_BYTES,
} from '@rca/contract'
import { describe, expect, it, vi } from 'vitest'
import { HttpError } from './errors.ts'
import { getOriginalFile, reserveR2Put } from './storage.ts'
import { START, testEnv } from './test/harness.ts'

const PERIOD = '2026-01'

/** Sets the R2 ledger, which is otherwise created empty by the first reservation. */
async function setLedger(values: {
  lifetime: number
  monthlyOperations: number
  monthlyPut: number
}): Promise<void> {
  await testEnv()
    .DB.prepare(
      `INSERT INTO r2_storage_budget (id, lifetime_put_bytes, monthly_period, monthly_operations, monthly_put_bytes)
       VALUES (1, ?, ?, ?, ?)`,
    )
    .bind(values.lifetime, PERIOD, values.monthlyOperations, values.monthlyPut)
    .run()
}

describe('R2 standard operation cap', () => {
  it('admits the operation that reaches the cap exactly, then refuses the next one', async () => {
    const env = testEnv()
    await setLedger({
      lifetime: 0,
      monthlyOperations: MAX_GLOBAL_R2_STANDARD_OPERATIONS - 1,
      monthlyPut: 0,
    })

    await expect(
      getOriginalFile(env.DB, env.FILES, 'users/none/x', () => START),
    ).resolves.toBeNull()
    await expect(
      getOriginalFile(env.DB, env.FILES, 'users/none/x', () => START),
    ).rejects.toMatchObject({ status: 429, code: 'storage_budget_exhausted' })
  })
})

describe('R2 lifetime and monthly write caps', () => {
  it('names the monthly budget, not the lifetime cap, when a put exactly fills the lifetime cap', async () => {
    const env = testEnv()
    const put = MIN_GLOBAL_R2_PUT_CHARGE_BYTES
    await setLedger({
      lifetime: MAX_GLOBAL_R2_WRITE_BYTES - put,
      monthlyOperations: 0,
      monthlyPut: MAX_MONTHLY_R2_PUT_BYTES,
    })

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const refusal = reserveR2Put(env.DB, () => START, put)
      await expect(refusal).rejects.toBeInstanceOf(HttpError)
      await expect(refusal).rejects.toMatchObject({
        status: 429,
        code: 'storage_budget_exhausted',
      })
      // The reason stays in the server log, where an operator can see which cap was hit.
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('monthly'))
    } finally {
      warn.mockRestore()
    }
  })

  it('tells the client nothing about the ledger caps, whichever one refuses', async () => {
    const env = testEnv()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      await setLedger({ lifetime: MAX_GLOBAL_R2_WRITE_BYTES, monthlyOperations: 0, monthlyPut: 0 })
      const refusal = reserveR2Put(env.DB, () => START, MIN_GLOBAL_R2_PUT_CHARGE_BYTES)
      await expect(refusal).rejects.toMatchObject({
        status: 429,
        code: 'storage_budget_exhausted',
        message: 'Original-file storage is temporarily unavailable. Your analysis is still saved.',
      })
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('lifetime'))
    } finally {
      warn.mockRestore()
    }
  })
})
