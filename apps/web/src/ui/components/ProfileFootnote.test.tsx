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
    expect(note).toHaveTextContent(
      'Based on 75 kg, man and your age at each effort. Change on Profile',
    )
    expect(screen.getByRole('link', { name: 'Change on Profile' })).toHaveAttribute(
      'href',
      '#/profile',
    )
  })

  it('writes the weight in pounds for imperial', () => {
    render(<ProfileFootnote massKg={75} units="imperial" birthYear={1986} sex="male" />)
    expect(screen.getByText(/Based on/)).toHaveTextContent(
      'Based on 165.3 lb, man and your age at each effort.',
    )
  })

  it('writes woman for a woman', () => {
    render(<ProfileFootnote massKg={75} units="metric" birthYear={1986} sex="female" />)
    expect(screen.getByText(/Based on/)).toHaveTextContent(
      '75 kg, woman and your age at each effort.',
    )
  })

  it('leaves out a part that is not set, such as the weight before one is entered', () => {
    render(<ProfileFootnote massKg={null} units="metric" birthYear={1986} sex="male" />)
    const note = screen.getByText(/Based on/)
    expect(note).toHaveTextContent('Based on man and your age at each effort. Change on Profile')
    expect(note).not.toHaveTextContent('kg')
  })

  it('leaves out the sex when it is not set', () => {
    render(<ProfileFootnote massKg={75} units="metric" birthYear={1986} sex={null} />)
    expect(screen.getByText(/Based on/)).toHaveTextContent(
      'Based on 75 kg and your age at each effort. Change on Profile',
    )
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
