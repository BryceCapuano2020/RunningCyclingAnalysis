import { useState } from 'react'
import { adoptionSummary, offerText, removeText } from '../analysis/adoptionCopy'
import type { LiftAdoption } from '../lift/useDeviceLifts'
import type { AdoptionOutcome, DeviceOfferStatus } from '../analysis/model'
import { dismissedOffer, dismissOffer, offerKey } from '../analysis/offerDismissal'
import { ConfirmDialog } from './ConfirmDialog'
import './DeviceOffer.css'

const NOTHING_KEPT: DeviceOfferStatus = { adoptable: 0, again: 0, held: 0 }

export interface DeviceOfferProps {
  offer: DeviceOfferStatus | null
  adoption: AdoptionOutcome | null
  /** Lifting sets kept in this browser, which the offer adds and removes with the activities; null until counted, when nothing is offered. */
  lifts?: number | null
  /** How adding the lifting sets ended. */
  liftResult?: LiftAdoption | null
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
  const [dismissed, setDismissed] = useState(() => dismissedOffer(account.userId))
  const [asking, setAsking] = useState<HTMLElement | null | undefined>(undefined)
  const standing = offer ?? NOTHING_KEPT
  const sets = lifts ?? 0
  const activities = standing.adoptable + standing.again + standing.held
  const kept = activities + sets
  const key = offerKey(activities, sets)
  // Asked again when what is kept changes. What cannot be added is still said, and can still be removed. It waits
  // until the activities and the lifting sets are counted, so the question is asked once, whole.
  const offered = offer !== null && lifts !== null && kept > 0 && dismissed !== key
  return (
    <>
      {(adoption !== null || liftResult !== null) && (
        <div className="notice device-offer">
          {/* The notice region says it (AppNotices), so a screen reader is not given it a second time here. */}
          <p aria-hidden="true">{adoptionSummary(adoption, liftResult)}</p>
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
            activities > 0 ? 'Activities kept in this browser' : 'Lifting sets kept in this browser'
          }
        >
          <p>{offerText(standing, account.email, sets)}</p>
          <div className="device-offer__actions">
            {standing.adoptable + sets > 0 && (
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
                  dismissOffer(account.userId, key)
                  setDismissed(key)
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
        description={kept === 0 ? '' : removeText(standing, sets)}
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
