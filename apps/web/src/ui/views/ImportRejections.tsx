import { RejectedFiles } from '../components'
import type { AnalysisController } from '../useAnalysis'

/** The files the last import turned away, and the duplicates it skipped. Both views show it. */
export function ImportRejections({ analysis }: { analysis: AnalysisController }) {
  return (
    <RejectedFiles
      rejected={analysis.state.rejected}
      unsupportedFiles={analysis.state.unsupportedFiles}
      duplicates={analysis.importOutcome?.duplicates ?? []}
    />
  )
}
