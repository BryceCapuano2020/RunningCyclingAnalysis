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
  /** Told each page change, with the control pressed, so focus can stay on it. */
  onPageChange: (page: number, control: HTMLElement) => void
  /** Reports focus entering or leaving the summary and the buttons. */
  onFocusWithinChange?: (focused: boolean) => void
  /**
   * The first and last item shown, counted from one, when a page holds items of more than one kind
   * of count, such as the activities a session's legs make up. Defaults to the page's own range.
   */
  shown?: { from: number; to: number }
}

/** The pages either side of the current one that are numbered as well as the first and last. */
const NEIGHBOUR_PAGES = 1

/** One slot in the row of page numbers: a page, or a gap before the page after it. */
type PageSlot = { kind: 'page'; page: number } | { kind: 'gap'; before: number }

/**
 * The pages to number: the first and last, the current page and its neighbours. A gap stands for
 * the pages left out between them, so a long list keeps a short row of numbers.
 */
function pageSlots(page: number, pageCount: number): PageSlot[] {
  const shown: number[] = []
  for (let index = 0; index < pageCount; index += 1) {
    const edge = index === 0 || index === pageCount - 1
    if (edge || Math.abs(index - page) <= NEIGHBOUR_PAGES) shown.push(index)
  }
  const slots: PageSlot[] = []
  shown.forEach((index, position) => {
    const previous = shown[position - 1]
    const hidden = previous === undefined ? 0 : index - previous - 1
    // A single page between two shown is shown too: a gap is worth its label only over two pages.
    if (hidden === 1) slots.push({ kind: 'page', page: index - 1 })
    if (hidden > 1) slots.push({ kind: 'gap', before: index })
    slots.push({ kind: 'page', page: index })
  })
  return slots
}

/** The summary of the page shown, and Previous and Next buttons with the pages between them. */
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
  shown,
}: PagerProps) {
  const firstIndex = page * pageSize
  const from = shown?.from ?? firstIndex + 1
  const to = shown?.to ?? Math.min(firstIndex + pageSize, total)
  const summary =
    pageCount > 1
      ? `Showing ${from}–${to} of ${total} ${noun}. Page ${page + 1} of ${pageCount}.`
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
          aria-disabled, so a click while busy keeps the focus on the button. The page shown is
          marked, and pressing it does nothing. */}
      {pageCount > 1 && (
        <nav className="pager__controls" aria-label={label}>
          <button
            type="button"
            className="btn"
            onClick={(event) => {
              if (!busy) onPageChange(page - 1, event.currentTarget)
            }}
            disabled={page === 0}
            aria-disabled={busy}
          >
            Previous page
          </button>
          <div className="pager__pages">
            {pageSlots(page, pageCount).map((slot) =>
              slot.kind === 'gap' ? (
                <span key={`gap-${slot.before}`} className="pager__gap">
                  <span aria-hidden="true">…</span>
                  <span className="sr-only">pages skipped</span>
                </span>
              ) : (
                <button
                  key={`page-${slot.page}`}
                  type="button"
                  className="btn pager__page"
                  aria-label={`Page ${slot.page + 1}`}
                  aria-current={slot.page === page ? 'page' : undefined}
                  aria-disabled={busy}
                  onClick={(event) => {
                    if (!busy && slot.page !== page) onPageChange(slot.page, event.currentTarget)
                  }}
                >
                  {slot.page + 1}
                </button>
              ),
            )}
          </div>
          <button
            type="button"
            className="btn"
            onClick={(event) => {
              if (!busy) onPageChange(page + 1, event.currentTarget)
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
