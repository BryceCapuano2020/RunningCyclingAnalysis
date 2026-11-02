/** The note where a ride figure is held: the same reason as the energy view, said once there. */
export const HELD_NOTE = 'Waits for your weight, as the energy view does.'
/** Where a chart would be, while no files are loaded. */
export const NO_FILES_EVIDENCE = 'Add your files to see this evidence.'
/** Where a chart would be, while a kept library loads and may still bring the results. */
export const RESTORING_EVIDENCE = 'Your saved results are loading.'
/** The energy view before any results: what it will show, since there is no ratio to name yet. */
export const NO_FILES_ENERGY = [
  'Once your files load, this view puts running and cycling on one scale.',
  'The scale is described below.',
]
/** The energy view, when Balance shows the age-grade gap: a cross-check of it, in lines. */
export const ENERGY_CROSS_CHECK = [
  'The energy view is a cross-check of the age-grade gap on Balance.',
  'Near even, the energy check can lean the other way from the age-grade gap.',
]
/** Where the energy range and Balance's points range sit side by side: how the two relate. */
export const ENERGY_BRIDGE = [
  'Balance gives its range in grade points.',
  'This view gives it in percent of energy.',
  'Both come from the same 90% spread in the model’s assumptions.',
  'So the two ranges describe one uncertainty in two units.',
]
/** The energy view when Balance shows the energy ratio instead of an age-grade gap. */
export const ENERGY_FALLBACK = [
  'When Balance has no age-grade gap to show, it shows the energy ratio instead.',
  'The ratio is running’s energy rate as a percentage of cycling’s.',
  'This view is that ratio.',
]
/** The energy view itself, while it waits: the one held line that is not the prompt. */
export const HELD_ENERGY = 'Waits for your weight, as Balance does.'
/** The energy view while Balance holds its headline: the reason is Balance's own (see heldTexts). */
export const HELD_COMPARISON = 'The comparison is held.'
/** The energy view with no ride to compare a run with, so a weight would not change what it shows. */
export const NEEDS_RIDE = 'Needs a ride to compare with running.'
/** The energy view with no run to compare a ride with: the run-equivalent of NEEDS_RIDE. */
export const NEEDS_RUN = 'Needs a run to compare with cycling.'
