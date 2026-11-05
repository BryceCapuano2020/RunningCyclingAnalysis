import { SWAPPED_NOTE } from './periodNouns'
import { captionWords } from './periodCaptionWords'
import type { PeriodCaptionProps } from './periodCaptionWords'

export type { PeriodCaptionProps } from './periodCaptionWords'

/**
 * The status a screen reader announces when the period changes. It stays mounted, and outside any disclosure, so
 * the change is announced whether or not the caption's line is open.
 */
export function PeriodStatus(props: PeriodCaptionProps) {
  return (
    <p role="status" className="sr-only">
      {captionWords(props).announcement}
    </p>
  )
}

/** The dates and the count of what is in the period, as one line; null when it has nothing to say. */
export function PeriodCaptionLine(props: PeriodCaptionProps) {
  const { dates, countHref, notCountedHref, swapped, inlineNote, className } = props
  const { count, notCountedText, said } = captionWords(props)
  if (!said) return null
  return (
    <p className={className}>
      {dates !== '' && <span className="range-picker__dates">{dates}</span>}
      {dates !== '' && count !== '' && ' · '}
      {count !== '' && (
        <span className="range-picker__count">
          {countHref === undefined ? count : <a href={countHref}>{count}</a>}
          {notCountedText !== '' && (
            <>
              {', '}
              {notCountedHref === undefined ? (
                notCountedText
              ) : (
                <a href={notCountedHref}>{notCountedText}</a>
              )}
            </>
          )}
        </span>
      )}
      {swapped && (
        <>
          {(dates !== '' || count !== '') && ' · '}
          <span className="range-picker__swapped">{SWAPPED_NOTE}</span>
        </>
      )}
      {inlineNote !== null && (
        <>
          {(dates !== '' || count !== '' || swapped) && ' · '}
          <span className="range-picker__inline-note">{inlineNote}</span>
        </>
      )}
    </p>
  )
}

/**
 * The dates and the count of what is in the period, as one line, then a status a screen reader announces when the
 * period changes. The line is left out when it has nothing to say; the status stays mounted.
 */
export function PeriodCaption(props: PeriodCaptionProps) {
  return (
    <>
      <PeriodCaptionLine {...props} />
      <PeriodStatus {...props} />
    </>
  )
}
