import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gradeText, readBalanceGrade, readSportGrade, sameGrade } from './grade-cards.mjs'

/* Synthetic page text only: the made-up grades below are not from any account. */

test('reads the percent and level Balance prints under a sport’s name', () => {
  const text = 'LEANS TOWARD RUNNING\nRUNNING\n47%\nRecreational\nCYCLING\n72%\nRegional\n'
  assert.deepEqual(readBalanceGrade(text, 'RUNNING'), { percent: '47%', level: 'Recreational' })
  assert.deepEqual(readBalanceGrade(text, 'CYCLING'), { percent: '72%', level: 'Regional' })
})

test('skips a sport’s name that is not followed by a percent, and a page with no grade', () => {
  assert.equal(readBalanceGrade('RUNNING\nNeeds your weight\nCYCLING\n', 'RUNNING'), null)
  assert.deepEqual(readBalanceGrade('RUNNING\nIN THE PERIOD\nRUNNING\n55%\nLocal\n', 'RUNNING'), {
    percent: '55%',
    level: 'Local',
  })
  assert.equal(readBalanceGrade('', 'RUNNING'), null)
})

test('reads Balance’s grade whatever the case its sport’s name is set in', () => {
  const text = 'RUNNING\nEVEN\nCYCLING\nRunning\n47%\nRecreational\nCycling\n72%\nRegional\n'
  assert.deepEqual(readBalanceGrade(text, 'RUNNING'), { percent: '47%', level: 'Recreational' })
  assert.deepEqual(readBalanceGrade(text, 'CYCLING'), { percent: '72%', level: 'Regional' })
})

test('reads the level and percent under a sport page’s age grade at threshold', () => {
  assert.deepEqual(readSportGrade('AGE GRADE AT THRESHOLD\nLOCAL\n55%\n7:30 /mi at age 40.\n'), {
    percent: '55%',
    level: 'LOCAL',
  })
  assert.equal(readSportGrade('AGE GRADE AT THRESHOLD\nAdd your year of birth\n'), null)
  assert.equal(readSportGrade('THRESHOLD PACE\n7:30\n/mi\n'), null)
})

test('reads a sport page’s level and percent from one line, under a title in sentence case', () => {
  assert.deepEqual(readSportGrade('Age grade at threshold\n\nLocal · 55%\n7:30 /MI AT AGE 40.\n'), {
    percent: '55%',
    level: 'Local',
  })
  assert.equal(readSportGrade('Age grade at threshold\nAge grades need your sex.\n'), null)
})

test('two prints are one grade when the percent and the level agree, whatever the level’s case', () => {
  const balance = { percent: '55%', level: 'Local' }
  assert.equal(sameGrade(balance, { percent: '55%', level: 'LOCAL' }), true)
  assert.equal(sameGrade(balance, { percent: '56%', level: 'LOCAL' }), false)
  assert.equal(sameGrade(balance, { percent: '55%', level: 'REGIONAL' }), false)
  assert.equal(gradeText(balance), '55% Local')
})
