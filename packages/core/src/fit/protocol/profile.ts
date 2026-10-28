/**
 * The parts of the public FIT profile this library reads or writes: global message numbers, field
 * numbers, and the enum values of sport, sub-sport, event and event type.
 */

export const MESG = {
  fileId: 0,
  sport: 12,
  session: 18,
  lap: 19,
  record: 20,
  event: 21,
  activity: 34,
} as const

export const FIELD = {
  timestamp: 253,
  // record
  positionLat: 0,
  positionLong: 1,
  altitude: 2,
  heartRate: 3,
  cadence: 4,
  fractionalCadence: 53,
  distance: 5,
  speed: 6,
  power: 7,
  temperature: 13,
  /** Three bytes: a 12-bit speed and a 12-bit distance counter, used when speed or distance is absent. */
  compressedSpeedDistance: 8,
  enhancedSpeed: 73,
  enhancedAltitude: 78,
} as const

/** Seconds from the Unix epoch to the FIT epoch, 1989-12-31T00:00:00Z. */
export const FIT_EPOCH_OFFSET_S = 631_065_600

/** FIT times below this value are system time (seconds since power-on), not a date. */
export const SYSTEM_TIME_LIMIT_S = 0x10000000

export const FILE_TYPE = { device: 1, settings: 2, sport: 3, activity: 4 } as const

export const SPORT = {
  generic: 0,
  running: 1,
  cycling: 2,
  transition: 3,
  fitnessEquipment: 4,
  swimming: 5,
  basketball: 6,
  soccer: 7,
  tennis: 8,
  americanFootball: 9,
  training: 10,
  walking: 11,
  crossCountrySkiing: 12,
  alpineSkiing: 13,
  snowboarding: 14,
  rowing: 15,
  mountaineering: 16,
  hiking: 17,
  multisport: 18,
  paddling: 19,
  flying: 20,
  eBiking: 21,
  motorcycling: 22,
  boating: 23,
  driving: 24,
  golf: 25,
  hangGliding: 26,
  horsebackRiding: 27,
  hunting: 28,
  fishing: 29,
  inlineSkating: 30,
  rockClimbing: 31,
  sailing: 32,
  iceSkating: 33,
  skyDiving: 34,
  snowshoeing: 35,
  snowmobiling: 36,
  standUpPaddleboarding: 37,
  surfing: 38,
  wakeboarding: 39,
  waterSkiing: 40,
  kayaking: 41,
  rafting: 42,
  windsurfing: 43,
  kitesurfing: 44,
  tactical: 45,
  jumpmaster: 46,
  boxing: 47,
  floorClimbing: 48,
  baseball: 49,
  diving: 53,
  shooting: 56,
  winterSport: 58,
  grinding: 59,
  hiit: 62,
  videoGaming: 63,
  racket: 64,
  wheelchairPushWalk: 65,
  wheelchairPushRun: 66,
  meditation: 67,
  paraSport: 68,
  discGolf: 69,
  teamSport: 70,
  cricket: 71,
  rugby: 72,
  hockey: 73,
  lacrosse: 74,
  volleyball: 75,
  waterTubing: 76,
  wakesurfing: 77,
  waterSport: 78,
  archery: 79,
  mixedMartialArts: 80,
  motorSports: 81,
  snorkeling: 82,
  dance: 83,
  jumpRope: 84,
  poolApnea: 85,
  mobility: 86,
  geocaching: 87,
  canoeing: 88,
  all: 254,
} as const

/** The sub-sports the app acts on, plus common ones. Other values decode as undefined. */
export const SUB_SPORT = {
  generic: 0,
  treadmill: 1,
  street: 2,
  trail: 3,
  track: 4,
  spin: 5,
  indoorCycling: 6,
  road: 7,
  mountain: 8,
  downhill: 9,
  recumbent: 10,
  cyclocross: 11,
  handCycling: 12,
  trackCycling: 13,
  indoorRowing: 14,
  elliptical: 15,
  stairClimbing: 16,
  lapSwimming: 17,
  openWater: 18,
  strengthTraining: 20,
  indoorSkiing: 25,
  cardioTraining: 26,
  indoorWalking: 27,
  eBikeFitness: 28,
  bmx: 29,
  casualWalking: 30,
  speedWalking: 31,
  virtualActivity: 58,
  indoorRunning: 45,
  gravelCycling: 46,
  eBikeMountain: 47,
  commuting: 48,
  mixedSurface: 49,
  indoorHandCycling: 88,
  indoorClimbing: 68,
  bouldering: 69,
  triathlon: 78,
  duathlon: 79,
  eBikeEnduro: 127,
} as const

/** Event enum: the values the parser reads. */
export const EVENT = { timer: 0, session: 8, lap: 9, activity: 26 } as const

export const EVENT_TYPE = {
  start: 0,
  stop: 1,
  consecutiveDepreciated: 2,
  marker: 3,
  stopAll: 4,
  beginDepreciated: 5,
  endDepreciated: 6,
  endAllDepreciated: 7,
  stopDisable: 8,
  stopDisableAll: 9,
} as const

export type FitSportName = keyof typeof SPORT
export type FitSubSportName = keyof typeof SUB_SPORT
export type FitEventType = keyof typeof EVENT_TYPE

function namesByNumber<T extends Record<string, number>>(table: T): Map<number, keyof T> {
  return new Map(Object.entries(table).map(([name, value]) => [value, name]))
}

const SPORT_NAMES = namesByNumber(SPORT)
const SUB_SPORT_NAMES = namesByNumber(SUB_SPORT)
const EVENT_TYPE_NAMES = namesByNumber(EVENT_TYPE)

export function sportName(value: number): FitSportName | undefined {
  return SPORT_NAMES.get(value) as FitSportName | undefined
}

export function subSportName(value: number): FitSubSportName | undefined {
  return SUB_SPORT_NAMES.get(value) as FitSubSportName | undefined
}

export function eventTypeName(value: number): FitEventType | undefined {
  return EVENT_TYPE_NAMES.get(value) as FitEventType | undefined
}

/** A FIT time in seconds as epoch milliseconds, or undefined for a system time or a missing value. */
export function fitTimeToEpochMs(seconds: number | undefined): number | undefined {
  if (seconds === undefined || seconds < SYSTEM_TIME_LIMIT_S) return undefined
  return (seconds + FIT_EPOCH_OFFSET_S) * 1000
}

/** Whole seconds of an epoch instant in FIT time. */
export function epochMsToFitTime(epochMs: number): number {
  return Math.floor(epochMs / 1000) - FIT_EPOCH_OFFSET_S
}
