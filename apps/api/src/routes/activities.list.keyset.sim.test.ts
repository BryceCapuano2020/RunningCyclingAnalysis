import { describe, expect, it } from 'vitest'
import { resetTestEnv } from '../test/harness.ts'
import { inListOrder, remove, seed, setup, T, walk, type Seed } from '../test/keyset.ts'

// The long keyset walks: every page size over a library, and random inserts and deletes between pages
// for six seeds. activities.list.keyset.test.ts checks each rule of the cursor on a small library.
describe('the keyset cursor, long walks', () => {
  it('walks the library newest first with ties by id, each row once, at several page sizes', async () => {
    const { h, token, rows } = await setup(41)
    for (const limit of [1, 3, 7, 41, 90]) {
      expect(await walk(h, token, limit), `limit ${limit}`).toEqual(inListOrder(rows))
    }
  })

  it('shows every row present for the whole walk exactly once, in order, under random inserts and deletes', async () => {
    for (const randomSeed of [1, 2, 3, 4, 5, 6]) {
      await resetTestEnv()
      const { h, token, uid, rows } = await setup(60)
      let state = randomSeed * 7919
      const random = (n: number) => {
        state = (state * 1103515245 + 12345) & 0x7fffffff
        return state % n
      }
      const alive = new Map(rows.map((row) => [row.id, row]))
      const stable = new Set(rows.map((row) => row.id))
      let counter = 0
      const seen = await walk(h, token, 4 + (randomSeed % 5), async () => {
        for (let step = 0; step < 3; step += 1) {
          if (random(2) === 0) {
            const row = {
              id: `rnd-${randomSeed}-${counter}`,
              createdAt: T - 2000 + random(18) * 1000,
            }
            counter += 1
            await seed(h, uid, [row])
            alive.set(row.id, row)
          } else {
            const victim = [...alive.keys()][random(alive.size)]
            if (victim !== undefined) {
              await remove(h, victim)
              alive.delete(victim)
              stable.delete(victim)
            }
          }
        }
      })
      const position = new Map(seen.map((id, i) => [id, i]))
      expect(new Set(seen).size, `seed ${randomSeed}: no repeats`).toBe(seen.length)
      for (const id of stable) expect(position.has(id), `seed ${randomSeed}: ${id}`).toBe(true)
      const byId = new Map<string, Seed>([...rows, ...alive.values()].map((row) => [row.id, row]))
      const order = seen.map((id) => byId.get(id)).filter((row): row is Seed => row !== undefined)
      expect(seen, `seed ${randomSeed}: order`).toEqual(inListOrder(order))
    }
  })
})
