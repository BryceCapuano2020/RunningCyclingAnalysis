// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PropertyList } from './PropertyList'
import { SECTION_ID } from './methodTopics'

afterEach(cleanup)

describe('PropertyList', () => {
  it('draws one row a fact, the label first and the value after it, in the order given', () => {
    const { container } = render(
      <PropertyList
        rows={[
          { label: 'Runs used', value: '4' },
          { label: 'Heart rate', value: 'Not used' },
        ]}
      />,
    )
    const rows = Array.from(container.querySelectorAll('.props__row'))
    expect(rows.map((row) => [row.children[0]?.tagName, row.children[0]?.textContent])).toEqual([
      ['DT', 'Runs used'],
      ['DT', 'Heart rate'],
    ])
    expect(rows.map((row) => [row.children[1]?.tagName, row.children[1]?.textContent])).toEqual([
      ['DD', '4'],
      ['DD', 'Not used'],
    ])
  })

  it('draws nothing without rows, with or without a method', () => {
    const { container } = render(<PropertyList rows={[]} method={SECTION_ID.how} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('ends with one Method link to the section named, and none without one', () => {
    const { container, rerender } = render(
      <PropertyList rows={[{ label: 'Range', value: '240–264 W' }]} method={SECTION_ID.how} />,
    )
    const link = screen.getByRole('link', { name: 'Method' })
    expect(link).toHaveAttribute('href', '#/method')
    expect(container.querySelectorAll('a')).toHaveLength(1)
    expect(container.querySelector('.props')?.lastElementChild).toBe(link)
    rerender(<PropertyList rows={[{ label: 'Range', value: '240–264 W' }]} />)
    expect(screen.queryByRole('link', { name: 'Method' })).toBeNull()
  })

  it('names the link for a screen reader without changing its visible text', () => {
    render(
      <PropertyList
        rows={[{ label: 'Range', value: '1' }]}
        method={SECTION_ID.how}
        methodName="how it was worked out"
      />,
    )
    const link = screen.getByRole('link', { name: 'Method, how it was worked out' })
    expect(link.firstChild?.textContent).toBe('Method')
    expect(link.querySelector('.sr-only')).toHaveTextContent(', how it was worked out')
  })

  it('keeps a value that is a link as a link', () => {
    render(<PropertyList rows={[{ label: 'Runs', value: <a href="#/activities">12</a> }]} />)
    expect(screen.getByRole('link', { name: '12' })).toHaveAttribute('href', '#/activities')
  })
})
