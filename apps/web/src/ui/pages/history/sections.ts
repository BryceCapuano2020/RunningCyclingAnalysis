/*
 * The sections of the History page, one line each: a chart adds its section here and nothing else on the web side.
 * A section is a file in this folder that exports a `HistorySection` (see types.ts); its `order` sets where it sits.
 * This file is merged as a union (.gitattributes), so two sections added at once both stay.
 */
export { hoursPerYear } from './hoursPerYear'
export { fitnessYears } from './fitnessYears'
