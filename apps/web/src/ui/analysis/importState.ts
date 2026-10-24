import { useRef, useState } from 'react'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { SessionState } from '@rca/core/session'
import type { ImportOutcome } from '../../worker/protocol'
import { EMPTY_SESSION } from './model'
import type { ImportProgress } from './model'

/**
 * The analysis an import was added to, and the one it made, with the outcome it was reported with.
 * `before` is null for a first import or when the sample was on screen.
 */
export interface ImportChange {
  outcome: ImportOutcome
  before: AnalysisResult | null
  after: AnalysisResult | null
}

/** The analysis an import is compared with: the result on screen, or nothing for the sample. */
export function baselineOf(state: SessionState): AnalysisResult | null {
  return state.isSample ? null : state.result
}

/**
 * What an import is doing: the analysed session, busy and progress, the outcome of the last import,
 * and the notice after a rebuild. A library change is tracked by the library, not here.
 */
export function useImportState() {
  const [state, setState] = useState<SessionState>(EMPTY_SESSION)
  const [busy, setBusy] = useState(false)
  const [waitingReason, setWaitingReason] = useState<string | null>(null)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [uploading, setUploading] = useState<number | null>(null)
  const [importOutcome, setImportOutcome] = useState<ImportOutcome | null>(null)
  const [importChange, setImportChange] = useState<ImportChange | null>(null)
  const [rebuildNotice, setRebuildNotice] = useState<string | null>(null)
  // Signed-in imports still waiting for their profile to save. They count as busy.
  const pendingAsyncImportsRef = useRef(0)
  // A file dropped before the account is known must not be analysed and then overwritten by the
  // initial server hydration. Keep it until the account state is known.
  const deferredImportsRef = useRef<File[][]>([])

  return {
    state,
    setState,
    busy,
    setBusy,
    waitingReason,
    setWaitingReason,
    progress,
    setProgress,
    uploading,
    setUploading,
    importOutcome,
    setImportOutcome,
    importChange,
    setImportChange,
    rebuildNotice,
    setRebuildNotice,
    pendingAsyncImportsRef,
    deferredImportsRef,
  }
}

export type ImportState = ReturnType<typeof useImportState>
