import { useState } from 'react'
import { adoptionText, offerText, removeText } from '../analysis/adoptionCopy'
import type { AdoptionOutcome, DeviceOfferStatus } from '../analysis/model'
import { dismissedOfferCount, dismissOffer } from '../analysis/offerDismissal'
import { ConfirmDialog } from './ConfirmDialog'
import './DeviceOffer.css'

export interface DeviceOfferProps {
  offer: DeviceOfferStatus | null
  adoption: AdoptionOutcome | null
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
  account,
  busy,
  onAdd,
  onRemove,
  onDismissResult,
  runThenFocus,
}: DeviceOfferProps) {
  const [dismissed, setDismissed] = useState(() => dismissedOfferCount(account.userId))
  const [asking, setAsking] = useState<HTMLElement | null | undefined>(undefined)
  const kept = offer === null ? 0 : offer.adoptable + offer.again + offer.held
  // Asked again when the number kept changes. What cannot be added is still said, and can still be removed.
  const offered = offer !== null && kept > 0 && dismissed !== kept
  return (
    <>
      {adoption !== null && (
        <div className="notice device-offer">
          {/* The notice region says it (AppNotices), so a screen reader is not given it a second time here. */}
          <p aria-hidden="true">{adoptionText(adoption)}</p>
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
        <section className="notice device-offer" aria-label="Activities kept in this browser">
          <p>{offerText(offer, account.email)}</p>
          <div className="device-offer__actions">
            {offer.adoptable > 0 && (
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
        open={asking !== undefined && offer !== null}
        title="Remove these from this browser?"
        description={offer === null ? '' : removeText(offer)}
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
