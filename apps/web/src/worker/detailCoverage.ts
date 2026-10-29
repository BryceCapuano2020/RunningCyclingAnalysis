import type { WorkerResponse } from './protocol'
import type { Workbench } from './workbench'
import type { TraceScope } from './workbenchStore'

/**
 * Tells the page which activities this browser holds detailed readings for, and since when. A sample
 * has none stored, and storage that cannot answer leaves the page not knowing, so neither is reported.
 */
export async function reportDetailCoverage(
  workbench: Workbench,
  scope: TraceScope | null,
  showingSample: boolean,
  post: (message: WorkerResponse) => void,
): Promise<void> {
  if (showingSample || scope === null) return
  const coverage = await workbench.coverage(scope)
  if (coverage !== null) post({ type: 'detailCoverage', ...coverage })
}
