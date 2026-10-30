import { useCallback, useRef, useState } from 'react'
import type { AnalysisResult } from '@rca/core/pipeline'
import { sameRegime } from '@rca/core/period'
import type { SessionState } from '@rca/core/session'
import type { ImportOutcome } from '../../worker/protocol'
import { EMPTY_SESSION } from './model'
import type { Baseline, ImportProgress } from './model'

/**
 * The analysis an import was added to, and the one it made, with the outcome it was reported with.
 * `before` is null for a first import or when the sample was on screen, or when the two were made under different
 * period regimes (`sameRegime`): the default period is 12 weeks until an import brings a sport it lacked, and then
 * all time, and a figure of one against a figure of the other is a different stretch of the library, not a change.
 */
export interface ImportChange {
  outcome: ImportOutcome
  before: AnalysisResult | null
  after: AnalysisResult | null
}

/** The analysis an import is compared with, and the period it was made under: the result on screen, or nothing for the sample. */
export function baselineOf(state: SessionState): Baseline | null {
  return state.isSample || state.result === null
    ? null
    : { result: state.result, period: state.period }
}

/**
 * What an import is compared with: the baseline's result when the import left the period in the regime it was
 * in, else nothing.
 */
export function comparableBefore(
  baseline: Baseline | null | undefined,
  after: SessionState,
): AnalysisResult | null {
  if (baseline === null || baseline === undefined) return null
  return sameRegime(baseline.period, after.period) ? baseline.result : null
}

/**
 * What an import is doing: the analysed session, busy and progress, the outcome of the last import,
 * and the notice after a rebuild. A library change is tracked by the library, not here.
 */
export function useImportState() {
  const [state, setStateNow] = useState<SessionState>(EMPTY_SESSION)
  // The session the worker last reported. The page renders it a little later, so an import reads
  // this, not the rendered state, when it is sent.
  const reportedRef = useRef<SessionState>(EMPTY_SESSION)
  const setState = useCallback((next: SessionState) => {
    reportedRef.current = next
    setStateNow(next)
  }, [])
  const [busy, setBusy] = useState(false)
  const [waitingReason, setWaitingReason] = useState<string | null>(null)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [uploading, setUploading] = useState<number | null>(null)
  // What the last signed-in import saved, as the worker counted it in the reply that ended the import.
  const [savedCount, setSavedCount] = useState<number | null>(null)
  const [importOutcome, setImportOutcome] = useState<ImportOutcome | null>(null)
  const [importChange, setImportChange] = useState<ImportChange | null>(null)
  const [rebuildNotice, setRebuildNotice] = useState<string | null>(null)
  // Signed-in imports still waiting for their profile to save. They count as busy.
  const pendingAsyncImportsRef = useRef(0)
  // Files analysed while the account loads, in this session only. Once the account is known they are
  // sent again, to the account when signed in, or through the signed-out import otherwise.
  const provisionalImportsRef = useRef<File[][]>([])
  // What those imports reported, added up, for the summary when they are kept as they are.
  const provisionalOutcomeRef = useRef<ImportOutcome | null>(null)

  return {
    state,
    setState,
    reportedRef,
    busy,
    setBusy,
    waitingReason,
    setWaitingReason,
    progress,
    setProgress,
    uploading,
    setUploading,
    savedCount,
    setSavedCount,
    importOutcome,
    setImportOutcome,
    importChange,
    setImportChange,
    rebuildNotice,
    setRebuildNotice,
    pendingAsyncImportsRef,
    provisionalImportsRef,
    provisionalOutcomeRef,
  }
}

export type ImportState = ReturnType<typeof useImportState>
