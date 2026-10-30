import { describe, expect, it } from 'vitest'
import { Gate, Room } from './saveLimits'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('Gate', () => {
  it('never runs more than its limit at once, and runs the rest in order', async () => {
    const gate = new Gate(2)
    const order: number[] = []
    let live = 0
    let most = 0
    const settle: (() => void)[] = []
    const runs = [0, 1, 2, 3].map((i) =>
      gate.run(async () => {
        order.push(i)
        live++
        most = Math.max(most, live)
        await new Promise<void>((resolve) => settle.push(resolve))
        live--
      }),
    )
    await tick()
    expect(order).toEqual([0, 1])
    settle[0]!()
    await tick()
    expect(order).toEqual([0, 1, 2])
    settle[1]!()
    await tick()
    settle[2]!()
    await tick()
    settle[3]!()
    await Promise.all(runs)
    expect(order).toEqual([0, 1, 2, 3])
    expect(most).toBe(2)
  })

  it('gives its place to the next task when one throws', async () => {
    const gate = new Gate(1)
    const failed = gate.run(async () => {
      throw new Error('no')
    })
    const next = gate.run(async () => 'ran')
    await expect(failed).rejects.toThrow('no')
    await expect(next).resolves.toBe('ran')
  })
})

describe('Room', () => {
  it('lets in up to its number of saves, and the rest wait for one to leave', async () => {
    const room = new Room(2, 1_000)
    await room.enter(1)
    await room.enter(1)
    let third = false
    void room.enter(1).then(() => (third = true))
    await tick()
    expect(third).toBe(false)
    room.leave(1)
    await tick()
    expect(third).toBe(true)
  })

  it('counts bytes, but admits one save however large when nothing is in flight', async () => {
    const room = new Room(10, 100)
    await room.enter(500)
    let second = false
    void room.enter(1).then(() => (second = true))
    await tick()
    expect(second).toBe(false)
    room.leave(500)
    await tick()
    expect(second).toBe(true)
  })
})
