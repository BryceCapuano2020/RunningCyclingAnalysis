import { Component } from 'react'
import type { ReactNode } from 'react'
import { retryPages } from '../lazyPages'
import './ErrorBoundary.css'

export interface PageLoadBoundaryProps {
  /** The page on screen; moving to another page clears a failure that belonged to the last one. */
  pageKey: string
  children: ReactNode
}

interface PageLoadBoundaryState {
  error: Error | null
  pageKey: string
}

/**
 * Catches a page that failed to load (offline, or a build that replaced its file) and says so in the
 * page's place, so the header and the tabs stay. Retry asks for the page again. Any other render error
 * still reaches the boundary above the whole app.
 */
// React only offers error boundaries as class components.
export class PageLoadBoundary extends Component<PageLoadBoundaryProps, PageLoadBoundaryState> {
  override state: PageLoadBoundaryState = { error: null, pageKey: this.props.pageKey }

  static getDerivedStateFromError(error: Error): Partial<PageLoadBoundaryState> {
    return { error }
  }

  static getDerivedStateFromProps(
    props: PageLoadBoundaryProps,
    state: PageLoadBoundaryState,
  ): PageLoadBoundaryState | null {
    return props.pageKey === state.pageKey ? null : { error: null, pageKey: props.pageKey }
  }

  private retry = () => {
    retryPages()
    this.setState({ error: null })
  }

  override render(): ReactNode {
    if (this.state.error === null) return this.props.children
    return (
      <section className="error-boundary card" role="alert">
        <h2>Couldn’t load this page.</h2>
        <button type="button" className="btn btn-primary" onClick={this.retry}>
          Retry
        </button>
      </section>
    )
  }
}
