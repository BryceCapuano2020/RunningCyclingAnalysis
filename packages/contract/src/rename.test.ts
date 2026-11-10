import { describe, expect, it } from 'vitest'
import { ActivityRenameSchema, MAX_ACTIVITY_NAME_CHARS } from './rename.ts'

describe('ActivityRenameSchema', () => {
  it('trims the name', () => {
    expect(ActivityRenameSchema.parse({ name: '  Tempo loop  ' })).toEqual({ name: 'Tempo loop' })
  })

  it('refuses an empty or blank name', () => {
    expect(ActivityRenameSchema.safeParse({ name: '' }).success).toBe(false)
    expect(ActivityRenameSchema.safeParse({ name: '   ' }).success).toBe(false)
  })

  it('takes exactly the longest name and refuses one more character', () => {
    const longest = 'x'.repeat(MAX_ACTIVITY_NAME_CHARS)
    expect(ActivityRenameSchema.safeParse({ name: longest }).success).toBe(true)
    expect(ActivityRenameSchema.safeParse({ name: `${longest}x` }).success).toBe(false)
  })

  it('refuses control characters and a name that is not text', () => {
    expect(ActivityRenameSchema.safeParse({ name: 'Two\nlines' }).success).toBe(false)
    expect(ActivityRenameSchema.safeParse({ name: 'Bell\u0007' }).success).toBe(false)
    expect(ActivityRenameSchema.safeParse({ name: 5 }).success).toBe(false)
  })

  it('keeps accents and symbols', () => {
    expect(ActivityRenameSchema.parse({ name: 'Côte d’Or 5k – easy' }).name).toBe(
      'Côte d’Or 5k – easy',
    )
  })
})
