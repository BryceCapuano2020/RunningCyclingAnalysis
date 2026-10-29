import { Component } from 'react'
import type { ReactNode } from 'react'
import './ErrorBoundary.css'

export interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Catches render errors below it and shows a card in place of the broken part. The card is friendly and
 * says what to do; the error's own message can name internals, so it stays out of the page. React logs
 * the error to the console for whoever is debugging.
 */
// React only offers error boundaries as class components, so this is the one class in the UI.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  override render(): ReactNode {
    if (this.state.error === null) return this.props.children
    return (
      <section className="error-boundary card" role="alert">
        <h2>Something went wrong</h2>
        <p className="muted">
          The page stopped working. Reload to try again; your saved activities are untouched.
        </p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </section>
    )
  }
}
