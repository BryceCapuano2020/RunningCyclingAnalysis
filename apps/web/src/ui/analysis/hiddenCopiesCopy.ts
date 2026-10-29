import { plural } from '../components/plural'

/** Note for saved activities left out of the analysis because another file holds their workout. */
export function hiddenCopiesText(count: number): string {
  const copies = count === 1 ? 'is a copy' : 'are copies'
  const counted = count === 1 ? 'is' : 'are'
  return (
    `${plural(count, 'saved activity', 'saved activities')} ${copies} of the same workout ` +
    `from another file and ${counted} not counted twice.`
  )
}
