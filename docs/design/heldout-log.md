# Held-out log

The synthetic generator has six configurations, A to F (`packages/core/src/synthetic/noise/`). A to C
(`tuningConfigs.ts`) are for tuning sweeps: the model-error floor, the fitness floor and window, the change-test
null, detector constants. D to F (`heldOut.ts`) are held out. Only `*.heldout.test.ts` and
`*.heldout.sim.test.ts` may import them (`heldOutGuard.test.ts` greps the tree), and they assert the bands in
`heldOut.bands.ts`.

Rules:

- A held-out band is never moved in the same commit that retunes a constant.
- A re-pin is its own commit. The message says `held-out re-pinned: <reason>`, and this table gets a new last
  row with the bands file's new hash (`shasum -a 256 heldOut.bands.ts`, first 12 characters).
  `heldOut.heldout.test.ts` fails when the last row does not name the file's current hash.

| Date       | Bands hash     | Reason                                                                                          |
| ---------- | -------------- | ----------------------------------------------------------------------------------------------- |
| 2026-10-30 | `633fe4233c8b` | First recording (D10 G2): same-heart-rate unit spread for D, E and F, from 8 seeds of 78 weeks. |
