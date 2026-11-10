import { useState } from 'react'
import type { ChangeEvent } from 'react'
import type { LiftSet } from '@rca/core/lift'
import type { UnitSystem } from '@rca/core/units'
import { PropertyList } from '../components/PropertyList'
import { plural } from '../components/plural'
import { fileProblem, previewHevy } from './hevyPreview'
import type { HevyPreview } from './hevyPreview'

export interface HevyImportProps {
  /** The sets the log holds now, to tell which an import replaces. */
  existing: readonly LiftSet[]
  units: UnitSystem
  /** Writes the sets to the log; resolves how many were kept. */
  onImport: (sets: readonly LiftSet[]) => Promise<number>
  onDone: () => void
}

type Stage =
  | { at: 'pick'; problem?: string }
  | { at: 'preview'; preview: HevyPreview }
  | { at: 'done'; kept: number }

/** The rows of a preview: what would be written, and what would not. */
function previewRows(preview: HevyPreview) {
  const rows = [
    {
      label: 'Sets',
      value: `${plural(preview.sets.length, 'set')} on ${plural(preview.days, 'day')}`,
    },
    { label: 'Lifts in the catalog', value: String(preview.catalogLifts) },
  ]
  if (preview.customLifts.length > 0)
    rows.push({ label: 'Custom lifts', value: preview.customLifts.join(', ') })
  if (preview.replaced > 0)
    rows.push({ label: 'Replace sets you have', value: plural(preview.replaced, 'set') })
  if (preview.skipped.length > 0)
    rows.push({ label: 'Rows skipped', value: String(preview.skipped.length) })
  return rows
}

/** The reasons rows were left out or kept without a value, each with the rows it names. */
function reasonsOf(entries: readonly { row: number; reason: string }[]): [string, number[]][] {
  const by = new Map<string, number[]>()
  for (const { row, reason } of entries) by.set(reason, [...(by.get(reason) ?? []), row])
  return [...by]
}

function Reasons({ title, entries }: { title: string; entries: HevyPreview['skipped'] }) {
  if (entries.length === 0) return null
  return (
    <div>
      <h3>{title}</h3>
      <ul>
        {reasonsOf(entries).map(([reason, rows]) => (
          <li key={reason}>
            {reason} Rows {rows.slice(0, 8).join(', ')}
            {rows.length > 8 ? ` and ${rows.length - 8} more` : ''}.
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Import from Hevy: one workouts CSV, read on this device, previewed in full, and written only when confirmed. The
 * sets go through the log's own write, so they land in the scope the logger uses (docs/design/lift-data.md).
 */
export function HevyImport({ existing, units, onImport, onDone }: HevyImportProps) {
  const [stage, setStage] = useState<Stage>({ at: 'pick' })
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file === undefined) return
    const problem = fileProblem(file)
    if (problem !== null) return setStage({ at: 'pick', problem })
    const text = await file.text().catch(() => null)
    if (text === null) return setStage({ at: 'pick', problem: 'That file could not be read.' })
    const result = previewHevy(text, existing, units)
    if ('refused' in result) return setStage({ at: 'pick', problem: result.refused })
    setStage({ at: 'preview', preview: result.preview })
  }

  const confirm = (preview: HevyPreview) => {
    setBusy(true)
    setFailed(false)
    onImport(preview.sets).then(
      (kept) => {
        setBusy(false)
        if (kept === 0) setFailed(true)
        else setStage({ at: 'done', kept })
      },
      () => {
        setBusy(false)
        setFailed(true)
      },
    )
  }

  if (stage.at === 'done')
    return (
      <>
        <p role="status">{`Imported ${plural(stage.kept, 'set')} from Hevy.`}</p>
        <button type="button" className="btn" onClick={onDone}>
          Done
        </button>
      </>
    )

  if (stage.at === 'preview') {
    const { preview } = stage
    return (
      <>
        {preview.sets.length === 0 ? (
          <p>No sets in this file.</p>
        ) : (
          <PropertyList rows={previewRows(preview)} />
        )}
        <Reasons title="Skipped" entries={preview.skipped} />
        <Reasons title="Kept without a value" entries={preview.adjusted} />
        {failed && (
          <p role="alert" className="lift__error">
            Not saved
          </p>
        )}
        <div className="lift__day-nav">
          {preview.sets.length > 0 && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => confirm(preview)}
            >
              Import sets
            </button>
          )}
          <button type="button" className="btn" onClick={onDone}>
            Cancel
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <label>
        Hevy workouts file (.csv)
        <input type="file" accept=".csv,text/csv" onChange={(event) => void pick(event)} />
      </label>
      <p>The file is read on this device. Only the sets are kept.</p>
      {stage.problem !== undefined && (
        <p role="alert" className="lift__error">
          {stage.problem}
        </p>
      )}
      <button type="button" className="btn" onClick={onDone}>
        Cancel
      </button>
    </>
  )
}
