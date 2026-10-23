import { plural } from './plural'
import { RANGE_OPTIONS } from './rangeOptions'
import { SegmentedControl } from './SegmentedControl'
import './RangePicker.css'

export interface RangePickerProps {
  /** Days back from the latest activity, or null for all time. */
  rangeDays: number | null
  onChange: (rangeDays: number | null) => void
  /** Activities inside the chosen period. */
  shown: number
  /** Activities in the files. */
  total: number
}

/**
 * Fitness changes over time, so best efforts from years ago should not be compared with this
 * month's. The period limits which efforts count.
 */
export function RangePicker({ rangeDays, onChange, shown, total }: RangePickerProps) {
  const selected = rangeDays === null ? 'all' : String(rangeDays)
  return (
    <div className="range-picker">
      <SegmentedControl
        legend="Period"
        options={RANGE_OPTIONS.map(({ value, label }) => ({ value, label }))}
        selected={selected}
        onSelect={(value) =>
          onChange(RANGE_OPTIONS.find((option) => option.value === value)?.days ?? null)
        }
      />
      {shown < total && (
        <p className="range-picker__count muted">{`${shown} of ${plural(total, 'activity', 'activities')}`}</p>
      )}
    </div>
  )
}
