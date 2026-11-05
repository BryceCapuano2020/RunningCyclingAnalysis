import { formatCount } from '../format/count'
import { plural } from './plural'
import { NOUNS, SWAPPED_NOTE } from './periodNouns'

export interface PeriodCaptionProps {
  /** The period's dates, such as "12 May – 3 Aug 2025". Empty when there is nothing to date. */
  dates: string
  /** How many of the total are in the period, whether or not the analysis counts them. */
  shown: number
  /** How many are on file. */
  total: number
  /** Of the total, how many the analysis does not count. */
  notCounted: number
  noun: keyof typeof NOUNS
  countHref?: string
  notCountedHref?: string
  /** The range on screen was swapped on Apply. */
  swapped: boolean
  /** The note said in the caption's own line, or null when it has a line of its own or there is none. */
  inlineNote: string | null
  /** The period's name, which the announcement says. */
  choiceLabel?: string
  className: string
}

/**
 * The dates and the count of what is in the period, as one line, then a status a screen reader announces when the
 * period changes. The line is left out when it has nothing to say; the status stays mounted.
 */
export function PeriodCaption({
  dates,
  shown,
  total,
  notCounted,
  noun,
  countHref,
  notCountedHref,
  swapped,
  inlineNote,
  choiceLabel,
  className,
}: PeriodCaptionProps) {
  const [singular, pluralForm] = NOUNS[noun]
  const totalPhrase = plural(total, singular, pluralForm)
  const notCountedText = notCounted > 0 ? `${formatCount(notCounted)} not counted` : ''
  // A period that holds fewer than the total says "42 of 1,200". One that holds them all says the total only to give what is not counted.
  const count =
    shown < total ? `${formatCount(shown)} of ${totalPhrase}` : notCounted > 0 ? totalPhrase : ''
  // Changing the period changes every number on the page, so the choice, the count and the dates are
  // announced. The region stays mounted, so the announcement is made when its text changes.
  const counted =
    total === 0
      ? `No ${pluralForm} to show`
      : shown < total
        ? `Showing ${formatCount(shown)} of ${totalPhrase}`
        : `Showing all ${totalPhrase}`
  const announcement = [counted, notCountedText, choiceLabel, dates, swapped ? SWAPPED_NOTE : '']
    .filter((part) => part !== undefined && part !== '')
    .join(', ')
  const said = dates !== '' || count !== '' || swapped || inlineNote !== null
  return (
    <>
      {said && (
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
      )}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </>
  )
}
