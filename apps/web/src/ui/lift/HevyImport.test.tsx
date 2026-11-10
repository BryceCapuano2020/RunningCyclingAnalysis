// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { HEVY_HEADER, hevyRow } from './hevyFixture'
import { HevyImport } from './HevyImport'

const csv = (name: string, text: string) => new File([text], name, { type: 'text/csv' })
const good = [
  HEVY_HEADER,
  hevyRow('2031-03-02 07:30:00', 'Squat (Barbell)', 0, 'normal', '100', '5'),
  hevyRow('2031-03-02 07:30:00', 'Zottman Curl', 0, 'normal', '10', '10'),
  hevyRow('2031-03-02 07:30:00', 'Squat (Barbell)', 1, 'normal', 'x', '5'),
].join('\n')

function setup(onImport = vi.fn().mockResolvedValue(2)) {
  const onDone = vi.fn()
  render(<HevyImport existing={[]} units="metric" onImport={onImport} onDone={onDone} />)
  return { onImport, onDone }
}
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
})
