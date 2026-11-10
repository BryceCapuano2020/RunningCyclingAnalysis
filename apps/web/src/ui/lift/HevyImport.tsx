import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { MAX_LIFT_SETS_PER_USER } from '@rca/core/lift'
import type { LiftSet } from '@rca/core/lift'
import type { UnitSystem } from '@rca/core/units'
import { PropertyList } from '../components/PropertyList'
import { plural } from '../components/plural'
import { fileProblem, hevyWrites, previewHevy } from './hevyPreview'
import type { HevyPreview } from './hevyPreview'

export interface HevyImportProps {
  /** The sets the log holds now, to tell which an import adds, repeats or changes. */
  existing: readonly LiftSet[]
  units: UnitSystem
  /** Writes the sets to the log; resolves how many were kept. */
  onImport: (sets: readonly LiftSet[]) => Promise<number>
  onDone: () => void
}

type Stage =
  | { at: 'pick'; problem?: string }
  | { at: 'preview'; preview: HevyPreview }
  | { at: 'done'; kept: number; notKept: number }

/** The rows of a preview: what would be written, and what would not. */
function previewRows(preview: HevyPreview, notKept: number) {
  const rows = [
    {
      label: 'Sets',
      value: `${plural(preview.sets.length, 'set')} on ${plural(preview.days, 'day')}`,
    },
    { label: 'Lifts in the catalog', value: String(preview.catalogLifts) },
  ]
  if (preview.customLifts.length > 0)
    rows.push({ label: 'Custom lifts', value: preview.customLifts.join(', ') })
  if (preview.identical > 0)
    rows.push({
      label: 'Already in your log',
      value: `${plural(preview.identical, 'set')}, skipped`,
    })
  if (preview.different.length > 0)
    rows.push({
      label: 'Differ from your log',
      value: `${plural(preview.different.length, 'set')}, kept as you have them`,
    })
  if (notKept > 0)
    rows.push({
      label: 'Past the limit',
      value: `${plural(notKept, 'set')} will not be kept: a log holds ${MAX_LIFT_SETS_PER_USER.toLocaleString('en-US')}`,
    })
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
  const [reading, setReading] = useState(false)
  const [replace, setReplace] = useState(false)
  // Counts the picks, so a read that finishes after the page is left or a newer pick sets nothing.
  const pickId = useRef(0)
  useEffect(
    () => () => {
      pickId.current = -1
    },
    [],
  )

  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target
    const file = input.files?.[0]
    // Cleared so choosing the same file again fires a change.
    input.value = ''
    if (file === undefined) return
    const id = ++pickId.current
    const current = () => pickId.current === id
    const problem = fileProblem(file)
    if (problem !== null) return setStage({ at: 'pick', problem })
    setReading(true)
    const text = await file.text().catch(() => null)
    // Lets the page paint "Reading" first. The parse then runs on this thread and blocks it for the
    // size of the file (up to the file limit); it is not in the worker.
    await new Promise((resolve) => setTimeout(resolve, 0))
    if (!current()) return
    setReading(false)
    if (text === null) return setStage({ at: 'pick', problem: 'That file could not be read.' })
    const result = previewHevy(text, existing, units)
    if ('refused' in result) return setStage({ at: 'pick', problem: result.refused })
    setReplace(false)
    setStage({ at: 'preview', preview: result.preview })
  }

  const confirm = (preview: HevyPreview) => {
    const { sets, notKept } = hevyWrites(preview, replace)
    setBusy(true)
    setFailed(false)
    onImport(sets).then(
      (kept) => {
        if (pickId.current < 0) return
        setBusy(false)
        if (kept === 0) setFailed(true)
        else setStage({ at: 'done', kept, notKept })
      },
      () => {
        if (pickId.current < 0) return
        setBusy(false)
        setFailed(true)
      },
    )
  }

  if (stage.at === 'done')
    return (
      <>
        <p role="status">
          {`Imported ${plural(stage.kept, 'set')} from Hevy.`}
          {stage.notKept > 0 && ` ${plural(stage.notKept, 'set')} did not fit and were not kept.`}
        </p>
        <button type="button" className="btn" onClick={onDone}>
          Done
        </button>
      </>
    )

  if (stage.at === 'preview') {
    const { preview } = stage
    const writes = hevyWrites(preview, replace)
    return (
      <>
        {preview.sets.length === 0 ? (
          <p>No sets in this file.</p>
        ) : (
          <PropertyList rows={previewRows(preview, writes.notKept)} />
        )}
        {preview.different.length > 0 && (
          <label>
            <input
              type="checkbox"
              checked={replace}
              onChange={(event) => setReplace(event.target.checked)}
            />{' '}
            {`Replace ${preview.different.length === 1 ? '1 set that differs' : `${preview.different.length} sets that differ`}`}
          </label>
        )}
        {preview.sets.length > 0 && writes.sets.length === 0 && <p>Nothing new to import.</p>}
        <Reasons title="Skipped" entries={preview.skipped} />
        <Reasons title="Kept without a value" entries={preview.adjusted} />
        {failed && (
          <p role="alert" className="lift__error">
            Not saved
          </p>
        )}
        <div className="lift__day-nav">
          {writes.sets.length > 0 && (
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
      {reading && <p role="status">Reading the file.</p>}
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
