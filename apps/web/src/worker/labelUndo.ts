import type { LabelProposal } from '@rca/core/import/applyLabels'

/**
 * The labels the last import applied, kept so the import's summary can take them off again. They belong to
 * one account and one library as it stood: any load, clear or sign-in after them (the library epoch moving)
 * makes them stale, and a stale set is not undone.
 */
export class LabelUndo {
  private held: { userId: string; epoch: number; applied: readonly LabelProposal[] } | null = null

  remember(userId: string, epoch: number, applied: readonly LabelProposal[]): void {
    this.held = applied.length === 0 ? null : { userId, epoch, applied }
  }

  /** The labels to take off for this account and library, once: they are forgotten as they are returned. */
  take(userId: string, epoch: number): readonly LabelProposal[] {
    const held = this.held
    this.held = null
    return held !== null && held.userId === userId && held.epoch === epoch ? held.applied : []
  }
}
