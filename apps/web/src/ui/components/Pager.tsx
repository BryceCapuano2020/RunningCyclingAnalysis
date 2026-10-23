import './Pager.css'

export interface PagerProps {
  /** The page shown, counted from zero. */
  page: number
  pageCount: number
  pageSize: number
  /** How many items there are in all. */
  total: number
  /** What the items are called, in the plural, such as "saved activities". */
  noun: string
  /** Names the page navigation, such as "Activity pages". */
  label: string
  /** Pauses paging while another action runs. */
  busy?: boolean
  /** Makes the summary a polite live region, so each page change is announced. */
  announce?: boolean
  onPageChange: (page: number) => void
  /** Reports focus entering or leaving the summary and the buttons. */
  onFocusWithinChange?: (focused: boolean) => void
}

/** The summary of the page shown, and Previous and Next buttons when there is more than one page. */
export function Pager({
  page,
  pageCount,
  pageSize,
  total,
  noun,
  label,
  busy = false,
  announce = false,
  onPageChange,
  onFocusWithinChange,
}: PagerProps) {
  const firstIndex = page * pageSize
  const summary =
    pageCount > 1
      ? `Showing ${firstIndex + 1}–${Math.min(firstIndex + pageSize, total)} of ${total} ${noun}. Page ${page + 1} of ${pageCount}.`
      : ''
  return (
    <div
      className="pager"
      onFocusCapture={() => onFocusWithinChange?.(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          onFocusWithinChange?.(false)
        }
      }}
    >
      <p
        className="pager__summary"
        role={announce ? 'status' : undefined}
        aria-live={announce ? 'polite' : undefined}
      >
        {summary}
      </p>
      {/* The first and last pages are disabled, as there is no page beyond them. Busy is
          aria-disabled, so a click while busy keeps the focus on the button. */}
      {pageCount > 1 && (
        <nav className="pager__controls" aria-label={label}>
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (!busy) onPageChange(page - 1)
            }}
            disabled={page === 0}
            aria-disabled={busy}
          >
            Previous page
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (!busy) onPageChange(page + 1)
            }}
            disabled={page >= pageCount - 1}
            aria-disabled={busy}
          >
            Next page
          </button>
        </nav>
      )}
    </div>
  )
}
