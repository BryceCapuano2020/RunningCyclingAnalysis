import type { ReactNode } from 'react'
import type { UnitSystem } from '@rca/core/units'
import { PropertyList } from '../components/PropertyList'
import type { Property } from '../components/property'
import { liftId } from './liftPageTypes'
import type { LiftOfDay } from './liftPageTypes'
import { setText } from './liftSetText'

/**
 * One lift of the day: its heading ("Back squat, barbell", no meta line) and its sets as a detail panel, one row a
 * set, labelled by position so a deleted set leaves no gap. The label is a button named "Edit set 2". The set being
 * edited is replaced by the form, with the rows before and after it kept as panels either side.
 */
export function LiftSection({
  lift,
  units,
  editingKey,
  rowForm,
  onEditSet,
}: {
  lift: LiftOfDay
  units: UnitSystem
  editingKey: string | null
  rowForm: ReactNode
  onEditSet: (key: string) => void
}) {
  const rows = lift.sets.map((set, index): [string, Property] => [
    set.key,
    {
      label: `Set ${index + 1}`,
      value: setText(set, lift.equipment, units),
      action: { name: `Edit set ${index + 1}`, onActivate: () => onEditSet(set.key) },
    },
  ])
  const at = rows.findIndex(([key]) => key === editingKey)
  const panel = (shown: [string, Property][]) => <PropertyList rows={shown.map(([, row]) => row)} />
  return (
    <section className="section lift__lift" data-lift={liftId(lift)}>
      <h3 className="lift__name" tabIndex={-1}>{`${lift.name}, ${lift.equipment}`}</h3>
      {at === -1 ? (
        panel(rows)
      ) : (
        <>
          {panel(rows.slice(0, at))}
          {rowForm}
          {panel(rows.slice(at + 1))}
        </>
      )}
    </section>
  )
}
