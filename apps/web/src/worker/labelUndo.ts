import type { LabelProposal } from '@rca/core/import/applyLabels'

/** The key the labels of the library kept in this browser are held under: no account owns them. */
export const DEVICE_LABELS = 'device'

/**
 * The labels the last import applied, kept so the import's summary can take them off again. They belong to one
 * account (or this browser's library, `DEVICE_LABELS`) and one library as it stood: any load, clear or sign-in after
 * them (the library epoch moving) makes them stale, and a stale set is not undone.
 */
export class LabelUndo {
  private held: { userId: string; epoch: number; applied: readonly LabelProposal[] } | null = null

  remember(userId: string, epoch: number, applied: readonly LabelProposal[]): void {
    this.held = applied.length === 0 ? null : { userId, epoch, applied }
  }

  /** Forgets them, as a clear or a load of the library makes them stale. */
  clear(): void {
    this.held = null
  }

  /** The labels to take off for this account and library, once: they are forgotten as they are returned. */
  take(userId: string, epoch: number): readonly LabelProposal[] {
    const held = this.held
    this.held = null
    return held !== null && held.userId === userId && held.epoch === epoch ? held.applied : []
  }
}
