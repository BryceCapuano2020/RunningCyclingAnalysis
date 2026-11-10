import { plural } from '../components/plural'
import type { LiftAdoption } from '../lift/useDeviceLifts'
import type { AdoptionOutcome, DeviceOfferStatus } from './model'

const ACTIVITIES = ['activity', 'activities'] as const
const NOTHING_ADDED = 'Nothing was added.'
const LIFT_SETS = ['lifting set', 'lifting sets'] as const

/** Plural-agreeing verb forms: "1 activity differs", "2 activities differ". */
const verb = (count: number, one: string, many: string) => (count === 1 ? one : many)

/**
 * The question the signed-in page asks about what this browser kept from before sign-in. It names the account the
 * activities would go to, says what is not added (routes), and counts what cannot be added yet.
 */
export function offerText(offer: DeviceOfferStatus, email: string, lifts = 0): string {
  const { adoptable, again, held } = offer
  const parts: string[] = []
  if (adoptable > 0 || lifts > 0) {
    const kept = [
      ...(adoptable > 0 ? [plural(adoptable, ...ACTIVITIES)] : []),
      ...(lifts > 0 ? [plural(lifts, ...LIFT_SETS)] : []),
    ].join(' and ')
    parts.push(
      `This browser kept ${kept} from before you signed in. Add ${adoptable + lifts === 1 ? 'it' : 'them'} to ${email}?`,
    )
    if (adoptable > 0)
      parts.push(
        'Routes are not added: each copy leaves this browser once your account has it, and its route goes with it.',
      )
  } else {
    parts.push(
      `This browser kept ${plural(again + held, ...ACTIVITIES)} from before you signed in. None can be added to ${email}.`,
    )
  }
  if (again > 0) {
    parts.push(
      `${plural(again, ...ACTIVITIES)}${adoptable > 0 ? ' more' : ''} ${verb(again, 'needs its file', 'need their files')} added again.`,
    )
  }
  if (held > 0) {
    parts.push(`${plural(held, ...ACTIVITIES)} ${verb(held, 'is', 'are')} in your account already.`)
  }
  return parts.join(' ')
}

/** How adding them ended: what the account has now, and what stays in this browser and why. */
export function adoptionText(outcome: AdoptionOutcome): string {
  const { saved, conflicts, failed, again, held } = outcome
  const parts: string[] = []
  if (saved > 0) parts.push(`Added ${plural(saved, ...ACTIVITIES)} to your account.`)
  if (conflicts > 0) {
    parts.push(
      `${plural(conflicts, ...ACTIVITIES)} already ${verb(conflicts, 'differs', 'differ')} in your account and ${verb(conflicts, 'stays', 'stay')} in this browser.`,
    )
  }
  if (failed > 0) {
    parts.push(
      `${plural(failed, ...ACTIVITIES)} could not be added and ${verb(failed, 'stays', 'stay')} in this browser. Try again.`,
    )
  }
  if (again > 0) {
    parts.push(
      `${plural(again, ...ACTIVITIES)} ${verb(again, 'needs its file', 'need their files')} added again.`,
    )
  }
  if (held > 0) {
    parts.push(
      `${plural(held, ...ACTIVITIES)} ${verb(held, 'was', 'were')} in your account already.`,
    )
  }
  return parts.length === 0 ? NOTHING_ADDED : parts.join(' ')
}

/** How adding the lifting sets ended: what the account took, what it held, what stays and what was refused. Empty when nothing happened. */
export function liftAdoptionText(result: LiftAdoption): string {
  const { sent, skipped, refused, capped, held, total } = result
  const added = sent - skipped
  // Rows the run never reached, because a failure stopped it.
  const unreached = Math.max(0, total - sent - refused - capped - held)
  const waiting = held + unreached
  const parts: string[] = []
  if (added > 0) parts.push(`Added ${plural(added, ...LIFT_SETS)} to your account.`)
  if (skipped > 0)
    parts.push(
      `${plural(skipped, ...LIFT_SETS)} ${verb(skipped, 'was', 'were')} in your account already.`,
    )
  if (capped > 0)
    parts.push(
      `${plural(capped, ...LIFT_SETS)} did not fit in your account and ${verb(capped, 'stays', 'stay')} in this browser.`,
    )
  if (waiting > 0)
    parts.push(
      `${plural(waiting, ...LIFT_SETS)} could not be sent yet and ${verb(waiting, 'stays', 'stay')} in this browser. Try again.`,
    )
  if (refused > 0)
    parts.push(
      `${plural(refused, ...LIFT_SETS)} ${verb(refused, 'was', 'were')} not valid and ${verb(refused, 'was', 'were')} removed.`,
    )
  return parts.join(' ')
}

/** One line for both adoptions; "Nothing was added." only when neither said anything. */
export function adoptionSummary(
  adoption: AdoptionOutcome | null,
  lifts: LiftAdoption | null,
): string {
  const liftText = lifts === null ? '' : liftAdoptionText(lifts)
  const activityText =
    adoption === null || (liftText !== '' && adoptionText(adoption) === NOTHING_ADDED)
      ? ''
      : adoptionText(adoption)
  return [activityText, liftText].filter((text) => text !== '').join(' ') || NOTHING_ADDED
}

/** What removing the kept library from this browser says it removes. */
export function removeText(offer: DeviceOfferStatus, lifts = 0): string {
  const kept = [
    ...(offer.adoptable + offer.again + offer.held > 0
      ? [plural(offer.adoptable + offer.again + offer.held, ...ACTIVITIES)]
      : []),
    ...(lifts > 0 ? [plural(lifts, ...LIFT_SETS)] : []),
  ].join(' and ')
  return `${kept} kept here from before you signed in will be removed from this browser, including any that cannot be added. Your account is not changed.`
}
