// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ProfileFootnote } from './ProfileFootnote'

afterEach(() => {
  cleanup()
})

describe('ProfileFootnote', () => {
  it('says what the results are based on, in the units the athlete uses, with a link to Profile', () => {
    render(<ProfileFootnote massKg={75} units="metric" birthYear={1986} sex="male" />)
    const note = screen.getByText(/Based on/)
    expect(note).toHaveTextContent('Based on your age, sex and 75 kg. Edit')
    const link = screen.getByRole('link', { name: 'Edit your details on Profile' })
    expect(link).toHaveAttribute('href', '#/profile')
    expect(link).toHaveTextContent(/^Edit$/)
  })

  it('writes the weight in pounds for imperial', () => {
    render(<ProfileFootnote massKg={75} units="imperial" birthYear={1986} sex="male" />)
    expect(screen.getByText(/Based on/)).toHaveTextContent(
      'Based on your age, sex and 165.3 lb. Edit',
    )
  })

  it('names no sex of its own, whichever is set', () => {
    render(<ProfileFootnote massKg={75} units="metric" birthYear={1986} sex="female" />)
    const note = screen.getByText(/Based on/)
    expect(note).toHaveTextContent('Based on your age, sex and 75 kg. Edit')
    expect(note).not.toHaveTextContent(/woman|man\b/)
  })

  it('leaves out a part that is not set, such as the weight before one is entered', () => {
    render(<ProfileFootnote massKg={null} units="metric" birthYear={1986} sex="male" />)
    const note = screen.getByText(/Based on/)
    expect(note).toHaveTextContent('Based on your age and sex. Edit')
    expect(note).not.toHaveTextContent('kg')
  })

  it('leaves out the sex when it is not set', () => {
    render(<ProfileFootnote massKg={75} units="metric" birthYear={1986} sex={null} />)
    expect(screen.getByText(/Based on/)).toHaveTextContent('Based on your age and 75 kg. Edit')
  })

  it('leaves its link off the unset line where the page already links to Profile from a note of its own', () => {
    render(
      <ProfileFootnote
        massKg={null}
        units="metric"
        birthYear={null}
        sex={null}
        unsetLink={false}
      />,
    )
    expect(screen.getByText('Your details are not set yet.')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('asks for the details when none is set, still linking to Profile', () => {
    render(<ProfileFootnote massKg={null} units="metric" birthYear={null} sex={null} />)
    expect(screen.getByText('Your details are not set yet.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add them on Profile' })).toHaveAttribute(
      'href',
      '#/profile',
    )
  })
})

describe('ProfileFootnote ages', () => {
  it('never gives an age of its own, which a grade at the age of an old effort would disagree with', () => {
    render(<ProfileFootnote massKg={75} units="metric" birthYear={1986} sex="male" />)
    expect(screen.getByText(/Based on/)).not.toHaveTextContent(/age \d/)
  })
})
