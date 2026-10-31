// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  UPLOAD_TITLES_KEY,
  saveUploadTitles,
  storedUploadTitles,
  uploadTitlesField,
} from '../uploadTitlesPreference'
import { TitleUpload } from './TitleUpload'

beforeEach(() => {
  localStorage.clear()
})
afterEach(() => {
  cleanup()
})

const NAME = 'Send my activity titles to my library'

describe('TitleUpload', () => {
  it('is off until chosen (nothing kept), and says what it does as the checkbox’s description', () => {
    expect(storedUploadTitles('u1')).toBeUndefined()
    render(<TitleUpload userId="u1" />)
    const choice = screen.getByRole('checkbox', { name: NAME })
    expect(choice).not.toBeChecked()
    expect(choice).toHaveAccessibleDescription(/A title can name a place or a route/)
    expect(choice).toHaveAccessibleDescription(/applies to activities saved from now on/)
  })

  it('keeps the choice for this account on this device, and takes it back', () => {
    render(<TitleUpload userId="u1" />)
    fireEvent.click(screen.getByRole('checkbox', { name: NAME }))
    expect(storedUploadTitles('u1')).toBe(true)
    expect(localStorage.getItem(`${UPLOAD_TITLES_KEY}.u1`)).toBe('1')
    fireEvent.click(screen.getByRole('checkbox', { name: NAME }))
    expect(storedUploadTitles('u1')).toBe(false)
    expect(localStorage.getItem(`${UPLOAD_TITLES_KEY}.u1`)).toBe('0')
  })

  it('shows the choice an account made earlier, and not another account’s', () => {
    saveUploadTitles('u1', true)
    const first = render(<TitleUpload userId="u1" />)
    expect(screen.getByRole('checkbox', { name: NAME })).toBeChecked()
    first.unmount()
    render(<TitleUpload userId="u2" />)
    expect(screen.getByRole('checkbox', { name: NAME })).not.toBeChecked()
  })
})

describe('the request field for the choice', () => {
  it('is absent until the account has chosen, then says what it chose', () => {
    expect(uploadTitlesField('u1')).toEqual({})
    saveUploadTitles('u1', true)
    expect(uploadTitlesField('u1')).toEqual({ uploadTitles: true })
    saveUploadTitles('u1', false)
    expect(uploadTitlesField('u1')).toEqual({ uploadTitles: false })
    expect(uploadTitlesField('u2')).toEqual({})
  })
})
