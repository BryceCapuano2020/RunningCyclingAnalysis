/**
 * The running-economy scale every conversion of a run's cost is read at: 1, the cost of running on the flat as the model prices
 * it (`FLAT_RUN_COST`). The display conversions, the digest's run curve, the duration tables and the ride anchor (`digest/rideAnchor.ts`)
 * all read this one value, so a pace read from a threshold and the pace worked from a run's data are on one scale. It is not read
 * from the prior (`PRIORS.runEconomyScale`), which describes the spread of athletes the analysis samples; conversions.test.ts holds
 * the two together. A leaf module, so that the duration tables and the digest can read it without importing the conversions.
 */
export const DISPLAY_ECONOMY = 1
