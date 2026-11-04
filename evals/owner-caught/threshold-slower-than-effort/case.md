# Threshold slower than an effort

**What the owner saw.** The threshold read slower than a 60-minute effort the owner had done.

**The rule it broke.** A threshold is what an athlete holds for an hour. An hour the period holds backs a
floor under it (docs/design/threshold.md), so the threshold is never slower (run) or lower (ride) than
the best hour.

**What the twin checks.** Per sport, over the default period and All time, in three synthetic libraries:
hours all through the years; two old hours lifted well above every other effort, where only the floor can set the threshold (checked for run and ride); one old hour among days with none, within the margin the rest of the
athlete's efforts support; and two old hours well above the rest that agree with each other. The threshold
is no slower (run) and no lower (ride) than the best 60 minutes on the sport page's curve, to its printed
rounding.

**Not covered.** One old hour far above everything else and agreed by nothing is one odd file by design
(`backedHour` in `packages/core/src/threshold/powerEstimate.ts`) and sets no floor. The twin does not
pin that either way. If the owner wants an isolated outlier to floor the threshold, that is a model change.

**Code it exercises.** Core's threshold estimators (`backedHour`, the run and ride estimates) through
`AnalysisSession`, and `apps/web/src/ui/records.ts` (`nativeCurve`, `valueAt`) for the best hour.
