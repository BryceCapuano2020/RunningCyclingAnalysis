import type { AthleteType } from '../types'

/**
 * The athlete's own word for an activity (D12 section 2.4): the type an export's list gives, when it says the
 * activity is not what the file's sport says. One table of exact names, and no guessing: a name that is not in it
 * (a localised one, a renamed one, a type Strava added) gives no label, and the file's sport stands. Run and ride
 * names give none, and an e-bike type is refused elsewhere (sportType.ts).
 */

/** Names are matched in lower case, with each run of spaces, dashes and underscores as one space, as sportType.ts does. */
const BY_NAME: ReadonlyMap<string, AthleteType> = new Map<string, AthleteType>([
  ['walk', 'walk'],
  ['hike', 'hike'],
  ...['nordic ski', 'backcountry ski', 'alpine ski', 'roller ski', 'snowboard'].map(
    (name): [string, AthleteType] => [name, 'ski'],
  ),
  ...[
    'weight training',
    'workout',
    'yoga',
    'pilates',
    'elliptical',
    'stair stepper',
    'rowing',
    'virtual rowing',
    'swim',
    'crossfit',
    'hiit',
    'high intensity interval training',
    'kayaking',
    'canoeing',
    'stand up paddling',
    'surfing',
    'sail',
    'windsurf',
    'kitesurf',
    'ice skate',
    'inline skate',
    'skateboard',
    'rock climbing',
    'golf',
    'soccer',
    'tennis',
    'badminton',
    'pickleball',
    'racquetball',
    'squash',
    'table tennis',
    'wheelchair',
    'snowshoe',
  ].map((name): [string, AthleteType] => [name, 'other']),
])

function keyOf(type: string): string {
  return type
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
    .trim()
}

/** The label a list type names, or undefined: not in the table, a run or a ride, or no type at all. */
export function athleteTypeOf(listed: string | undefined): AthleteType | undefined {
  return listed === undefined ? undefined : BY_NAME.get(keyOf(listed))
}

/**
 * The fields of an imported activity that come from the label: the one the options carry (a rebuild keeps the
 * saved one, which the file cannot give) or the one the export's list type names. Nothing for no label.
 */
export function athleteTypeFields(opts: { athleteType?: AthleteType; activityType?: string }): {
  athleteType?: AthleteType
} {
  const label = opts.athleteType ?? athleteTypeOf(opts.activityType)
  return label === undefined ? {} : { athleteType: label }
}
