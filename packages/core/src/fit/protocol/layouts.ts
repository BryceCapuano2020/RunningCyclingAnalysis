import { BASE } from './baseTypes'
import { defineLayout } from './writer'
import { MESG } from './profile'

/** Message layouts the library writes. Every message of one type uses the same layout. */

export const FILE_ID_LAYOUT = defineLayout(MESG.fileId, [
  { name: 'type', num: 0, base: BASE.enum },
  { name: 'manufacturer', num: 1, base: BASE.uint16 },
  { name: 'product', num: 2, base: BASE.uint16 },
  { name: 'timeCreated', num: 4, base: BASE.uint32 },
])

export const SPORT_LAYOUT = defineLayout(MESG.sport, [
  { name: 'sport', num: 0, base: BASE.enum },
  { name: 'subSport', num: 1, base: BASE.enum },
])

export const SESSION_LAYOUT = defineLayout(MESG.session, [
  { name: 'messageIndex', num: 254, base: BASE.uint16 },
  { name: 'timestamp', num: 253, base: BASE.uint32 },
  { name: 'startTime', num: 2, base: BASE.uint32 },
  { name: 'sport', num: 5, base: BASE.enum },
  { name: 'subSport', num: 6, base: BASE.enum },
  { name: 'totalElapsedTime', num: 7, base: BASE.uint32 },
  { name: 'totalTimerTime', num: 8, base: BASE.uint32 },
  { name: 'totalDistance', num: 9, base: BASE.uint32 },
  { name: 'firstLapIndex', num: 25, base: BASE.uint16 },
  { name: 'numLaps', num: 26, base: BASE.uint16 },
  { name: 'event', num: 0, base: BASE.enum },
  { name: 'eventType', num: 1, base: BASE.enum },
])

export const LAP_LAYOUT = defineLayout(MESG.lap, [
  { name: 'messageIndex', num: 254, base: BASE.uint16 },
  { name: 'timestamp', num: 253, base: BASE.uint32 },
  { name: 'startTime', num: 2, base: BASE.uint32 },
  { name: 'totalElapsedTime', num: 7, base: BASE.uint32 },
  { name: 'totalTimerTime', num: 8, base: BASE.uint32 },
  { name: 'totalDistance', num: 9, base: BASE.uint32 },
  { name: 'event', num: 0, base: BASE.enum },
  { name: 'eventType', num: 1, base: BASE.enum },
])

export const RECORD_LAYOUT = defineLayout(MESG.record, [
  { name: 'timestamp', num: 253, base: BASE.uint32 },
  { name: 'positionLat', num: 0, base: BASE.sint32 },
  { name: 'positionLong', num: 1, base: BASE.sint32 },
  { name: 'heartRate', num: 3, base: BASE.uint8 },
  { name: 'cadence', num: 4, base: BASE.uint8 },
  { name: 'fractionalCadence', num: 53, base: BASE.uint8 },
  { name: 'distance', num: 5, base: BASE.uint32 },
  { name: 'enhancedSpeed', num: 73, base: BASE.uint32 },
  { name: 'enhancedAltitude', num: 78, base: BASE.uint32 },
  { name: 'power', num: 7, base: BASE.uint16 },
  { name: 'temperature', num: 13, base: BASE.sint8 },
])

export const EVENT_LAYOUT = defineLayout(MESG.event, [
  { name: 'timestamp', num: 253, base: BASE.uint32 },
  { name: 'event', num: 0, base: BASE.enum },
  { name: 'eventType', num: 1, base: BASE.enum },
])

export const ACTIVITY_LAYOUT = defineLayout(MESG.activity, [
  { name: 'timestamp', num: 253, base: BASE.uint32 },
  { name: 'totalTimerTime', num: 0, base: BASE.uint32 },
  { name: 'numSessions', num: 1, base: BASE.uint16 },
  { name: 'type', num: 2, base: BASE.enum },
  { name: 'event', num: 3, base: BASE.enum },
  { name: 'eventType', num: 4, base: BASE.enum },
])
