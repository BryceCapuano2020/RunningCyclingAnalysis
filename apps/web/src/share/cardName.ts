/**
 * The name printed on a shared card, kept on this device only. It is never sent to the server, and
 * the card is drawn in the browser, so nothing here touches the network.
 */

/** Where the name is kept. Exported so the privacy page's tests read the same key. */
export const CARD_NAME_KEY = 'rca.card-name.v1'

/** The most characters the name takes. The card sets it small, so a longer name would crowd its row. */
export const CARD_NAME_MAX = 40

/** A name held to CARD_NAME_MAX characters. Counted in code points, so an emoji is never split. */
export function capCardName(text: string): string {
  return [...text].slice(0, CARD_NAME_MAX).join('')
}

/** The name as the card prints it: trimmed, or null when there is no name to print. */
export function cardNameShown(name: string): string | null {
  const shown = name.trim()
  return shown === '' ? null : shown
}

/** The name kept on this device: empty when none is kept or storage cannot be read. */
export function storedCardName(): string {
  try {
    return capCardName(localStorage.getItem(CARD_NAME_KEY) ?? '')
  } catch {
    return ''
  }
}

/** Keeps the name on this device; an empty name removes it. A refused store is not an error. */
export function saveCardName(name: string): void {
  try {
    if (name === '') localStorage.removeItem(CARD_NAME_KEY)
    else localStorage.setItem(CARD_NAME_KEY, name)
  } catch {
    // Storage can be unavailable (private windows); the name still goes on the card for this visit.
  }
}
