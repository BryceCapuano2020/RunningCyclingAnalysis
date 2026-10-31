// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ImportManifest } from '../importManifest'
import { IncompleteImportNotice } from './IncompleteImportNotice'

const MANIFEST: ImportManifest = {
  id: 'a',
  scope: 'device',
  startedAt: 1,
  updatedAt: 1,
  sources: [],
  expected: 10,
  read: 4,
  damaged: [],
  state: 'interrupted',
}

describe('IncompleteImportNotice', () => {
  it('says how far the import got, and lets the athlete go on with what the library holds', async () => {
    const onAccept = vi.fn()
    render(<IncompleteImportNotice manifest={MANIFEST} onAccept={onAccept} />)

    expect(screen.getByRole('status')).toHaveTextContent('stopped after 4 of 10 files')
    await userEvent.click(screen.getByRole('button', { name: 'Use what I have' }))

    expect(onAccept).toHaveBeenCalledOnce()
  })
})
