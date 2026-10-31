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

Recorded: the spread of the same-heart-rate unit (first row), and the fitness monitor's false alarms an athlete-year and
its power on a planted 8% loss, run on eight libraries of 156 weeks of each configuration's own sport (second row; D and E
run, F ride). E has too few steady runs for the monitor (11 to 28 in 130 weeks), so its bands record silence. Bands for the
change test (D5) are not recorded yet. Each is added as a new row here.

| Date       | Hash           | Reason                                                                                                                                        |
| ---------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-30 | `ca768de472aa` | First recording (D10 G2): same-heart-rate unit spread for D, E and F, from 8 seeds of 78 weeks.                                               |
| 2026-10-30 | `fa8d7d62dee0` | Fitness monitor on D to F (D10 G5): false alarms an athlete-year D 0.125, E 0, F 0.5; share seeing an 8% loss in 26 weeks D 0.5, E 0, F 0.75. |
