# Cross-sport: a ride graded as a share of world class

## The old rule and why it was wrong

A ride's running equivalent was the run with the same gross energy, with the ride priced at an assumed gross efficiency of 21.5% and
sampled over efficiency, running economy and the heart-rate ratio. At that efficiency a world-class hour on the bike (6.40 W/kg) costs
more energy than the world-class running hour, so a world-class rider graded about 121% of running's world class, and every ride was
raised by the same ratio. A balanced athlete read as leaning toward cycling.

## The anchor

Each sport is graded against its own best: a ride against the best riders' hour, a run against the best runners'. A ride at a share
`q` of the cycling world-class hour maps to the run whose energy is the same share `q` of the running world-class hour.

- `M(v) = 1.22 + 3.9 v` is the gross metabolic W/kg of running at speed `v` on the flat (economy 1).
- `v_WC60(sex)` is the speed the WMA road standard holds for 3600 s in the open age (25): the speed `gradeAtSpeed` grades 100% at 3600 s.
  It is found once per sex by bisection.
- The anchor factor is `f(sex) = M(v_WC60) / (CYCLING_WORLD_CLASS_HOUR_WKG[sex] / GE)`, where `GE` is the efficiency the ride's gross
  metabolic W/kg was priced with (the prior mean). `GE` cancels, so the efficiency prior does not matter.
- A ride's running equivalent at any duration is `v_eq = M^-1(f(sex) x rideMetabolicWkg)`. Age is left to the running age tables:
  cycling ages like running in energy terms.
- Its range is the anchor's alone, `exp(+-1.645 x 0.03)` on the energy (5th and 95th percentiles). A threshold's own low and high are
  10th and 90th percentiles, so their log distances from the estimate are scaled by 1.645 / 1.2816 to the 5th and 95th before they are
  combined with the anchor's in quadrature on the log scale.

## Constants and sources

- `CYCLING_WORLD_CLASS_HOUR_WKG = { male: 6.40, female: 5.69 }`: the top of the FTP column of Coggan's power profile table. The men's
  value differs between reprints (6.40 in one, 6.60 in another).
- `CYCLING_ANCHOR_LOG_SD = 0.03` carries that disagreement.
- `v_WC60` comes from the USATF road age standards the app already grades by.

## Sensitivity

The men's anchor 6.60 instead of 6.40 lowers every ride's equivalent energy by 3%. In grade that is about 2.4 points for a ride at 75%
of the cycling world-class hour (at ages 25 to 35), from 1.6 points at half of it to 3.2 at 95%, and a little more at older ages
(`rideAnchor.test.ts` pins the 75% figure). The anchor's range (log sd 0.03) is the allowance for that, and it is in every ride's range.

## One standing

`sportStanding(result, profile, context)` (packages/core/src/standing) is the only place these figures are made: the threshold grades,
the ride as a run, the lean and its range, and what the lower sport needs to match the higher. The web formats them.
