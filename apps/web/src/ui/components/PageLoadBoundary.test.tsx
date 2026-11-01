// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react'
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

  it('loads the page by itself when the connection comes back, once per return', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const load = vi
      .fn<() => Promise<typeof Loaded>>()
      .mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module'))
      .mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module'))
      .mockResolvedValue(Loaded)
    mount(load)
    await screen.findByRole('alert', undefined, { timeout: 5000 })

    // Back online, but the file is still out of reach: the card stays and asks again at the next return.
    act(() => void window.dispatchEvent(new Event('online')))
    await screen.findByRole('alert', undefined, { timeout: 5000 })
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))

    act(() => void window.dispatchEvent(new Event('online')))
    expect(
      await screen.findByRole('heading', { name: 'The page' }, { timeout: 5000 }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(load).toHaveBeenCalledTimes(3)

    // A page that loaded listens no more.
    act(() => void window.dispatchEvent(new Event('online')))
    expect(load).toHaveBeenCalledTimes(3)
  })
})
