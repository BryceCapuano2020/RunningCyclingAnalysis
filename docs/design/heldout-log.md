# Held-out log

The synthetic generator has six configurations, A to F (`packages/core/src/synthetic/noise/`). A to C
(`tuningConfigs.ts`) are for tuning sweeps: the model-error floor, the fitness floor and window, the change-test
null, detector constants. D to F (`heldOut.ts`) are held out. Only `*.heldout.test.ts` and
`*.heldout.sim.test.ts` may import them. `heldOutGuard.node.test.ts` reads every source file (packages, apps,
scripts including `scripts/ops`, and the config files at the root) and fails on an import, require, glob or
run-time-built import that could reach them, in any letter case, and on an ordinary file importing a held-out test.
The bands they must keep are in `heldOut.bands.ts`.

Rules:

- A held-out band is never moved in the same commit that retunes a constant.
- A re-pin, or any edit to `heldOut.ts`, is its own commit. The message says `held-out re-pinned: <reason>`, and
  this table gets a new last row with the hash of `heldOut.ts` followed by `heldOut.bands.ts`
  (`cat heldOut.ts heldOut.bands.ts | shasum -a 256`, first 12 characters). `heldOutLog.node.test.ts` fails
  when the last row does not name the current hash.

Recorded now: the spread of the same-heart-rate unit. Bands for the false-alarm rate and for power on a planted
truth are not recorded yet: they need a detector that runs on these configurations, and arrive when the D2 and D5
sims adopt the presets (D10 G5). Each is added as a new row here.

| Date       | Hash           | Reason                                                                                          |
| ---------- | -------------- | ----------------------------------------------------------------------------------------------- |
| 2026-10-30 | `ca768de472aa` | First recording (D10 G2): same-heart-rate unit spread for D, E and F, from 8 seeds of 78 weeks. |
