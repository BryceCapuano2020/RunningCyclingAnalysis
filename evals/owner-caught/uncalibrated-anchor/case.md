# Uncalibrated anchor

**What the owner saw.** A grade anchor shipped without being calibrated against its published source, so
grades moved by an unchecked amount.

**The rule it broke.** A model constant is calibrated against its published source before it ships
(docs/PROCESS.md, "Formula and model changes").

**What the twin checks.** Each sport's world-class hour reproduces the reference the repository already
cites, to a stated tolerance:

- Cycling: the anchor is 6.40 W/kg for men and 5.69 for women, the top of the FTP column of Allen and
  Coggan's power profile table (`rideAnchor.ts`, docs/design/cross-sport.md). A rider at that hour grades
  100% within half a point. The other reprint's men's value, 6.60, lands inside the range the anchor
  states for 6.40 (its 3% log spread, 5th to 95th).
- Running, men: the anchor's running hour is within 0.5% of the open men's world-record pace at an hour,
  read between the half marathon and the marathon entries of `RUN_WORLD_RECORD_SPEEDS`
  (`packages/core/src/constants.ts`).

**Missing sources.** The repository cites no published women's running hour (the record table is men's
open), no second reprint for the women's cycling value, and no source for the 3% spread beyond the 6.40
against 6.60 disagreement. The twin pins what is documented and nothing else. The women's anchor is
checked only as 100% at the published cycling hour.

**Code it exercises.** `packages/core/src/digest/rideAnchor.ts` through `equivalentRunSpeed`
(`@rca/core/pipeline`), `CYCLING_ANCHOR_WKG` (`@rca/core/display`) and `gradeAtSpeed` (`@rca/core/grade`).
