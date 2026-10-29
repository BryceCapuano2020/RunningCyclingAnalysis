import type { UnitSystem } from '@rca/core/units'
import { UNIT_OPTIONS, displayWeight, weightUnit } from '../athlete'
import { SEX_NOUN } from '../grades'
import type { AgeProfile } from '../grades'
import { SAMPLE_SETTINGS } from '../sampleAthlete'
import { SAMPLE_SETTINGS_NOTE } from '../sampleSettingsCopy'
import { SegmentedControl } from './SegmentedControl'
import './SampleSettings.css'

/** One setting, in the sample's persona and the visitor's units. */
function shown(kg: number | null, units: UnitSystem): string {
  return `${displayWeight(kg, units)} ${weightUnit(units)}`
}

/**
 * The sample athlete's settings, read-only: the year of birth, sex and weights the sample is analysed
 * with. They come from the persona, never from what the visitor has entered, and none of them is saved.
 * Only the units, which are how the visitor reads every figure, can be changed.
 */
export function SampleSettings({
  profile,
  units,
  onUnitsChange,
}: {
  /** The sample's year of birth and sex, as the results grade it: the year depends on the day the sample was drawn. */
  profile: AgeProfile
  units: UnitSystem
  /** The units are the visitor's own display choice, not the sample's, so they stay editable. */
  onUnitsChange: (units: UnitSystem) => void
}) {
  const rows: [label: string, value: string][] = [
    ['Year of birth', String(profile.birthYear)],
    ['Sex', SEX_NOUN[profile.sex].replace(/^./, (c) => c.toUpperCase())],
    ['Body weight', shown(SAMPLE_SETTINGS.massKg, units)],
    ['Bike and gear weight', shown(SAMPLE_SETTINGS.bikeMassKg, units)],
  ]
  return (
    <section className="section sample-settings" aria-labelledby="profile-sample">
      <h2 id="profile-sample">Sample athlete</h2>
      <p className="secondary">{SAMPLE_SETTINGS_NOTE}</p>
      <dl className="sample-settings__list">
        {rows.map(([label, value]) => (
          <div key={label} className="sample-settings__row">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <SegmentedControl
        legend="Units"
        options={UNIT_OPTIONS}
        selected={units}
        onSelect={onUnitsChange}
      />
    </section>
  )
}
