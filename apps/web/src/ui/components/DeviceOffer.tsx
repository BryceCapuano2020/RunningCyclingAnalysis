import { useState } from 'react'
import type { AdoptResult } from '../../worker/liftSync'
import { adoptionText, liftAdoptionText, offerText, removeText } from '../analysis/adoptionCopy'
import type { AdoptionOutcome, DeviceOfferStatus } from '../analysis/model'
import { dismissedOfferCount, dismissOffer } from '../analysis/offerDismissal'
import { ConfirmDialog } from './ConfirmDialog'
import './DeviceOffer.css'

const NOTHING_KEPT: DeviceOfferStatus = { adoptable: 0, again: 0, held: 0 }

export interface DeviceOfferProps {
  offer: DeviceOfferStatus | null
  adoption: AdoptionOutcome | null
  /** Lifting sets kept in this browser, which the offer adds and removes with the activities. */
  lifts?: number
  /** How adding the lifting sets ended. */
  liftResult?: AdoptResult | null
  /** The signed-in account, which the offer names so the question says whose library it adds to. */
  account: { userId: string; email: string }
  /** Adding is running, or something else is: the buttons wait. */
  busy: boolean
  onAdd: () => void
  onRemove: () => void
  onDismissResult: () => void
  /** Runs an action whose button goes away when it finishes, then puts focus back on the page. */
  runThenFocus: (action: () => void, control?: Element) => void
}

/**
 * What this browser kept before sign-in, offered to the account that is signed in now: Add, Not now, or Remove from
 * this browser. After adding, it says what the account has and what stays. Nothing shows when nothing can be added
 * and there is no result to report.
 */
export function DeviceOffer({
  offer,
  adoption,
  lifts = 0,
  liftResult = null,
  account,
  busy,
  onAdd,
  onRemove,
  onDismissResult,
  runThenFocus,
}: DeviceOfferProps) {
  const [dismissed, setDismissed] = useState(() => dismissedOfferCount(account.userId))
  const [asking, setAsking] = useState<HTMLElement | null | undefined>(undefined)
  const standing = offer ?? NOTHING_KEPT
  const kept = standing.adoptable + standing.again + standing.held + lifts
  // Asked again when the number kept changes. What cannot be added is still said, and can still be removed.
  const offered = kept > 0 && dismissed !== kept
  return (
    <>
      {(adoption !== null || liftResult !== null) && (
        <div className="notice device-offer">
          {/* The notice region says it (AppNotices), so a screen reader is not given it a second time here. */}
          <p aria-hidden="true">
            {[
              adoption === null ? null : adoptionText(adoption),
              liftResult === null ? null : liftAdoptionText(liftResult),
            ]
              .filter((text) => text !== null)
              .join(' ')}
          </p>
          <div className="device-offer__actions">
            <button
              type="button"
              className="btn"
              onClick={(event) => runThenFocus(onDismissResult, event.currentTarget)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      {offered && (
        <section
          className="notice device-offer"
          aria-label={
            standing.adoptable + standing.again + standing.held > 0
              ? 'Activities kept in this browser'
              : 'Lifting sets kept in this browser'
          }
        >
          <p>{offerText(standing, account.email, lifts)}</p>
          <div className="device-offer__actions">
            {standing.adoptable + lifts > 0 && (
              <button
                type="button"
                className="btn"
                aria-disabled={busy}
                onClick={(event) => {
                  if (!busy) runThenFocus(onAdd, event.currentTarget)
                }}
              >
                Add to my account
              </button>
            )}
            <button
              type="button"
              className="btn"
              onClick={(event) =>
                runThenFocus(() => {
                  dismissOffer(account.userId, kept)
                  setDismissed(kept)
                }, event.currentTarget)
              }
            >
              Not now
            </button>
            <button
              type="button"
              className="btn"
              aria-disabled={busy}
              onClick={(event) => {
                if (!busy) setAsking(event.currentTarget)
              }}
            >
              Remove from this browser
            </button>
          </div>
        </section>
      )}
      <ConfirmDialog
        open={asking !== undefined && kept > 0}
        title="Remove these from this browser?"
        description={kept === 0 ? '' : removeText(standing, lifts)}
        confirmLabel="Remove"
        opener={asking ?? null}
        onConfirm={() => {
          setAsking(undefined)
          onRemove()
        }}
        onClose={() => setAsking(undefined)}
      />
    </>
  )
}
