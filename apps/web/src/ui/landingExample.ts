import { LANDING_EXAMPLE as figures } from 'virtual:landing-figures'
import type { LandingFigures } from './landingFigures'

/**
 * The landing example's numbers: the sample athlete's own, made from its analysis when the app is built
 * (scripts/landingFigures.ts), on the fixed reference clock (SAMPLE_CLOCK). The season is anchored to a Sunday,
 * so the app's own sample, loaded on any day, gives the same figures (sampleSections.test.ts checks that).
 */
export const LANDING_EXAMPLE: LandingFigures = figures
