/**
 * Whether a choice the athlete made has not reached the account yet (a save that is waiting or failed, or a read of the
 * account's settings that has not settled). The server's results are computed without it, so they are not shown over this
 * device's own (docs/design/server-compute.md, decision 4).
 */
let chosenCount = 0
let settledCount = 0

/** A choice was made. */
export function noteChoice(): void {
  chosenCount += 1
}

/** The count of choices so far; what a save that starts now will carry. */
export function choicesSoFar(): number {
  return chosenCount
}

/** A save or a pull that began when `count` choices had been made has reached the account. */
export function noteSettled(count: number): void {
  settledCount = Math.max(settledCount, count)
}

/** Forgets every choice: sign-out, or another account. */
export function resetUnsent(): void {
  chosenCount = 0
  settledCount = 0
}

export function settingsUnsent(): boolean {
  return settledCount < chosenCount
}
