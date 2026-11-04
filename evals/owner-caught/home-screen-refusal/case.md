# Home screen refusal

**What the owner saw.** On a long history in both sports, the Balance home screen declined to answer and
hedged in the words it did print.

**The rule it broke.** Lead with the best estimate. Never refuse when the data can answer, and no
hedge or disclaimer lines (docs/DESIGN.md, copy rules).

**What the twin checks.** Five synthetic athletes (steady, gaining, losing, a low heart rate, no heart rate) with six years in both
sports, over the default period, All time and 365 days. For each: both sports are graded, both have a
threshold card, the headline is not held, the balance is stated and no sport is short of efforts. The
printed words of the cards (figure, basis line, range, level target) match no hedge or refusal pattern.

**Code it exercises.** `apps/web/src/ui/resultHold.ts` (`heldPick`), `thresholdGrade.ts`,
`components/balanceScale.ts` (`balanceOfPick`), `pages/balanceMissing.ts`, `records.ts` (`threshold`),
`thresholdBasis.ts`, `thresholdRange.ts`, `levelTarget.ts`, and core's `sportStanding`, through
`AnalysisSession`.
