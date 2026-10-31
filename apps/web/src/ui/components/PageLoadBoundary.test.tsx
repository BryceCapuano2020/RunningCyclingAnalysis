// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Suspense } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { lazyPage } from '../lazyPages'
import { PageLoadBoundary } from './PageLoadBoundary'

const Loaded = () => <h1>The page</h1>

function mount(load: () => Promise<typeof Loaded>) {
  const { Page } = lazyPage<object>(load)
  return render(
    <>
      <nav>Tabs</nav>
      <PageLoadBoundary pageKey="balance">
        <Suspense fallback={<p>Loading</p>}>
          <Page />
        </Suspense>
      </PageLoadBoundary>
    </>,
  )
}

describe('a page that fails to load', () => {
  it('says so beside the tabs, and loads the page when Retry is pressed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const load = vi
      .fn<() => Promise<typeof Loaded>>()
      .mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module'))
      .mockResolvedValue(Loaded)
    mount(load)
    expect(await screen.findByRole('alert', undefined, { timeout: 5000 })).toHaveTextContent(
      'Couldn’t load this page.',
    )
    expect(screen.getByText('Tabs')).toBeInTheDocument()
    expect(load).toHaveBeenCalledTimes(1)

    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
    expect(
      await screen.findByRole('heading', { name: 'The page' }, { timeout: 5000 }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(load).toHaveBeenCalledTimes(2)
  })
})
