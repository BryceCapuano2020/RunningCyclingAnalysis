import { describe, expect, it } from 'vitest'
import { activityCell, sourceNote } from './activityText'

describe('sourceNote', () => {
  it('names the activity a value is from', () => {
    expect(sourceNote('run-1', { 'run-1': 'Morning run' })).toBe('from Morning run')
  })

  it('gives no note without a name, rather than the raw id', () => {
    expect(sourceNote('run-1', undefined)).toBeUndefined()
    expect(sourceNote('run-1', {})).toBeUndefined()
    expect(sourceNote(null, { 'run-1': 'Morning run' })).toBeUndefined()
  })
})

describe('activityCell', () => {
  it('shows the name, a dash where no activity set the value, and blank without a name', () => {
    expect(activityCell('run-1', { 'run-1': 'Morning run' })).toBe('Morning run')
    expect(activityCell(null, { 'run-1': 'Morning run' })).toBe('—')
    expect(activityCell('run-1', undefined)).toBe('')
    expect(activityCell('run-1', {})).toBe('')
  })
})
