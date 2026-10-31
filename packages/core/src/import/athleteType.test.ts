import { describe, expect, it } from 'vitest'
import { athleteTypeFields, athleteTypeOf } from './athleteType'

describe('athleteTypeOf', () => {
  it('names the label of an exact type name, however it is spaced or cased', () => {
    expect(athleteTypeOf('Walk')).toBe('walk')
    expect(athleteTypeOf('hike')).toBe('hike')
    expect(athleteTypeOf('Nordic Ski')).toBe('ski')
    expect(athleteTypeOf('nordic-ski')).toBe('ski')
    expect(athleteTypeOf('  Backcountry   Ski ')).toBe('ski')
    expect(athleteTypeOf('Alpine_Ski')).toBe('ski')
    expect(athleteTypeOf('Roller Ski')).toBe('ski')
    expect(athleteTypeOf('Snowboard')).toBe('ski')
    expect(athleteTypeOf('Weight Training')).toBe('other')
    expect(athleteTypeOf('Stair Stepper')).toBe('other')
    expect(athleteTypeOf('HIIT')).toBe('other')
    expect(athleteTypeOf('Swim')).toBe('other')
  })

  it('A5: gives nothing for a localised name or one it does not know, and never guesses', () => {
    for (const name of [
      'Wanderung',
      'Randonnée',
      'Marche',
      'Ice Climbing Gala',
      'Hiking trip',
      'Walks',
      '',
    ]) {
      expect(athleteTypeOf(name), name).toBeUndefined()
    }
  })

  it('gives nothing for a run or a ride, or for no type', () => {
    for (const name of [
      'Run',
      'Trail Run',
      'Virtual Run',
      'Ride',
      'Mountain Bike Ride',
      'Gravel Ride',
      'E-Bike Ride',
    ]) {
      expect(athleteTypeOf(name), name).toBeUndefined()
    }
    expect(athleteTypeOf(undefined)).toBeUndefined()
  })
})

describe('athleteTypeFields', () => {
  it('is the label the options carry, else the list type’s, else nothing', () => {
    expect(athleteTypeFields({ activityType: 'Hike' })).toEqual({ athleteType: 'hike' })
    expect(athleteTypeFields({ athleteType: 'ski', activityType: 'Hike' })).toEqual({
      athleteType: 'ski',
    })
    expect(athleteTypeFields({ athleteType: 'walk', activityType: 'Run' })).toEqual({
      athleteType: 'walk',
    })
    expect(athleteTypeFields({ activityType: 'Run' })).toEqual({})
    expect(athleteTypeFields({})).toEqual({})
  })
})
