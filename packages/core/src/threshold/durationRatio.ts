/**
 * The best average power over `durationS` as a multiple of threshold power, for a rider who gave it all: the 95% rule at
 * 20 min (1.053, so 20 min power is 95% of threshold), the 90% rule at 8 min (1.11), and a log fade to 1.00 at 60 min.
 * Dividing a best by this gives the threshold it implies.
 */
export function durationRatio(durationS: number): number {
  const minutes = durationS / 60
  if (minutes <= 20) return 1.015 + 0.76 / minutes
  return 1.053 - (0.053 * Math.log(minutes / 20)) / Math.log(3)
}

/**
 * How far that ratio varies between riders, as a share: smallest at 20 min, where the rules are best known, growing with the
 * log of the distance either side. Squared, it is the variance a ride's estimate carries.
 */
export function ratioSpread(durationS: number): number {
  return 0.025 + 0.02 * Math.abs(Math.log(durationS / 1200))
}
