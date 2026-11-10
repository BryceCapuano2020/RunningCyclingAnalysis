// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { LiftSet } from '@rca/core/lift'
import { HEVY_HEADER, hevyRow } from './hevyFixture'
import { HevyImport } from './HevyImport'

const csv = (name: string, text: string) => new File([text], name, { type: 'text/csv' })
const good = [
  HEVY_HEADER,
  hevyRow('2031-03-02 07:30:00', 'Squat (Barbell)', 0, 'normal', '100', '5'),
  hevyRow('2031-03-02 07:30:00', 'Zottman Curl', 0, 'normal', '10', '10'),
  hevyRow('2031-03-02 07:30:00', 'Squat (Barbell)', 1, 'normal', 'x', '5'),
].join('\n')

function setup(onImport = vi.fn().mockResolvedValue(2), existing: LiftSet[] = []) {
  const onDone = vi.fn()
  const view = render(
    <HevyImport existing={existing} units="metric" onImport={onImport} onDone={onDone} />,
  )
  return { onImport, onDone, view }
}
const held = (order: number, loadKg: number): LiftSet => ({
  date: '2031-03-02',
  time: '07:30',
  timePrecision: 'session',
  exercise: 'back-squat',
  equipment: 'barbell',
  setOrder: order,
  reps: 5,
  loadKg,
})
const pickFile = (file: File) => userEvent.upload(screen.getByLabelText(/Hevy workouts file/), file)

describe('HevyImport', () => {
  it('previews, then writes only on confirm', async () => {
    const { onImport } = setup()
    await pickFile(csv('w.csv', good))
    expect(await screen.findByText('2 sets on 1 day')).toBeTruthy()
    expect(screen.getByText('zottman-curl')).toBeTruthy()
    expect(screen.getByText(/The weight is not a number\. Rows 4\./)).toBeTruthy()
    expect(onImport).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Import sets' }))
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1))
    expect(onImport.mock.calls[0]?.[0]).toHaveLength(2)
    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      'Imported 2 sets from Hevy.',
    )
  })

  it('writes nothing on cancel', async () => {
    const { onImport, onDone } = setup()
    await pickFile(csv('w.csv', good))
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(onImport).not.toHaveBeenCalled()
    expect(onDone).toHaveBeenCalled()
  })

  it.each([
    ['notes.txt', 'abc', /Choose a \.csv file/],
    ['w.csv', '', /empty/],
    ['w.csv', 'a,b\n1,2', /missing columns/],
  ])('says in a sentence why %s is not read', async (name, text, message) => {
    const { onImport } = setup()
    await pickFile(csv(name, text))
    // The file input's accept filter is not applied by the test driver, so a wrong type reaches the check.
    expect((await screen.findByRole('alert')).textContent).toMatch(message)
    expect(onImport).not.toHaveBeenCalled()
  })

  it('keeps the preview and says so when the write keeps nothing', async () => {
    setup(vi.fn().mockResolvedValue(0))
    await pickFile(csv('w.csv', good))
    await userEvent.click(await screen.findByRole('button', { name: 'Import sets' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Not saved')
    expect(screen.getByRole('button', { name: 'Import sets' })).toBeTruthy()
  })

  it('keeps a differing set by default, skips an identical one and replaces only when chosen', async () => {
    // Set 1 matches the file; set 2 differs from it by load.
    const file = [
      HEVY_HEADER,
      hevyRow('2031-03-02 07:30:00', 'Squat (Barbell)', 0, 'normal', '100', '5'),
      hevyRow('2031-03-02 07:30:00', 'Squat (Barbell)', 1, 'normal', '100', '5'),
      hevyRow('2031-03-02 07:30:00', 'Squat (Barbell)', 2, 'normal', '100', '5'),
    ].join('\n')
    const { onImport } = setup(vi.fn().mockResolvedValue(1), [held(1, 100), held(2, 90)])
    await pickFile(csv('w.csv', file))
    expect(await screen.findByText('1 set, skipped')).toBeTruthy()
    expect(screen.getByText('1 set, kept as you have them')).toBeTruthy()
    const box = screen.getByRole('checkbox', { name: 'Replace 1 set that differs' })
    expect((box as HTMLInputElement).checked).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: 'Import sets' }))
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1))
    expect(onImport.mock.calls[0]?.[0].map((s: LiftSet) => s.setOrder)).toEqual([3])
  })

  it('writes the differing sets once replace is ticked', async () => {
    const file = [
      HEVY_HEADER,
      hevyRow('2031-03-02 07:30:00', 'Squat (Barbell)', 0, 'normal', '100', '5'),
    ].join('\n')
    const { onImport } = setup(vi.fn().mockResolvedValue(1), [held(1, 90)])
    await pickFile(csv('w.csv', file))
    expect(screen.queryByRole('button', { name: 'Import sets' })).toBeNull()
    await userEvent.click(
      await screen.findByRole('checkbox', { name: /Replace 1 set that differs/ }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Import sets' }))
    await waitFor(() => expect(onImport.mock.calls[0]?.[0]).toHaveLength(1))
  })

  it('offers nothing to import when every set is already in the log', async () => {
    const file = [
      HEVY_HEADER,
      hevyRow('2031-03-02 07:30:00', 'Squat (Barbell)', 0, 'normal', '100', '5'),
    ].join('\n')
    setup(undefined, [held(1, 100)])
    await pickFile(csv('w.csv', file))
    expect(await screen.findByText('Nothing new to import.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Import sets' })).toBeNull()
  })

  it('sets nothing after the page is left mid-read', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { view } = setup()
    const pending = pickFile(csv('w.csv', good))
    view.unmount()
    await pending
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it('reads the same file again after it is chosen once', async () => {
    setup()
    const input = screen.getByLabelText(/Hevy workouts file/) as HTMLInputElement
    await userEvent.upload(input, csv('w.csv', good))
    expect(input.value).toBe('')
  })
})
