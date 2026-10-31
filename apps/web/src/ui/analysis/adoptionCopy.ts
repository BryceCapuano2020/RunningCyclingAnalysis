import { plural } from '../components/plural'
import type { AdoptionOutcome, DeviceOfferStatus } from './model'

const ACTIVITIES = ['activity', 'activities'] as const

/** Plural-agreeing verb forms: "1 activity differs", "2 activities differ". */
const verb = (count: number, one: string, many: string) => (count === 1 ? one : many)

/**
 * The question the signed-in page asks about what this browser kept from before sign-in. It names the account the
 * activities would go to, says what is not added (routes), and counts what cannot be added yet.
 */
export function offerText(offer: DeviceOfferStatus, email: string): string {
  const { adoptable, again, held } = offer
  const parts: string[] = []
  if (adoptable > 0) {
    parts.push(
      `This browser kept ${plural(adoptable, ...ACTIVITIES)} from before you signed in. Add ${adoptable === 1 ? 'it' : 'them'} to ${email}?`,
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
  return parts.length === 0 ? 'Nothing was added.' : parts.join(' ')
}

/** What removing the kept library from this browser says it removes. */
export function removeText(offer: DeviceOfferStatus): string {
  const total = offer.adoptable + offer.again + offer.held
  return `${plural(total, ...ACTIVITIES)} kept here from before you signed in will be removed from this browser, including any that cannot be added. Your account is not changed.`
}
