/**
 * A best that stands out was picked because it stood out, so its size overstates what is there: a duration that is
 * truly 10% above its curve is flagged only on the draws where noise adds to it. The size to state is the one the
 * flagged draws are centred on, not the draw itself.
 *
 * The estimate is the conditional maximum likelihood estimate for a draw `z` (in standard errors) kept because it
 * exceeded `cut`: the mean `mu` whose normal distribution, cut off below `cut`, has a mean of `z`. It lies below `z`, far
 * below it when `z` is near the cut and almost at it when `z` is well past.
 */

/** 1 - the standard normal's distribution function, to a relative error of about 1e-7 in the tails too (Numerical Recipes erfcc). */
function upperTail(x: number): number {
  const z = Math.abs(x) / Math.SQRT2
  const t = 1 / (1 + 0.5 * z)
  const erfc =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t *
                              (-1.13520398 +
                                t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    )
  const tail = 0.5 * erfc
  return x >= 0 ? tail : 1 - tail
}

const density = (x: number): number => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI)

/** The mean of a normal of mean `mu` and sd 1 cut off below `cut`. */
function truncatedMean(mu: number, cut: number): number {
  return mu + density(cut - mu) / upperTail(cut - mu)
}

/** How far below the cut the search looks: the estimate of a draw at the cut itself is minus infinity. */
const SEARCH_BELOW = 12
const STEPS = 60

/**
 * The mean, in standard errors, that a draw `z` past `cut` is most likely to have come from, given that it was kept for
 * being past it. Never above `z`; at the floor of the search (`cut` - 12) for a draw at the cut.
 */
export function conditionalEstimate(z: number, cut: number): number {
  if (!(z > cut)) return cut - SEARCH_BELOW
  let low = cut - SEARCH_BELOW
  let high = z
  for (let i = 0; i < STEPS; i++) {
    const middle = (low + high) / 2
    if (truncatedMean(middle, cut) < z) low = middle
    else high = middle
  }
  return (low + high) / 2
}
