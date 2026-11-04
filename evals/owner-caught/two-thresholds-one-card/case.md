# Two thresholds on one card

**What the owner saw.** A card showed a sport's threshold beside a different figure for the same thing:
the ride's grade sat next to a ride number that was not the one the grade came from.

**The rule it broke.** One figure, one function: the same formula everywhere (docs/ENGINEERING.md, "One
figure, one function"), so no surface works out its own copy of a threshold.

**What the twin checks.** For a steady synthetic athlete, over the default period and All time, each
sport's threshold as printed on the card, drawn on the curve and cut into the zones is one value to
the printed rounding. The run's grade is the grade of the printed pace. The ride's grade is the grade of
the ride as a run, and the ride as a run is the run the printed watts are worth.

**Code it exercises.** `apps/web/src/ui/records.ts` (`threshold`), `thresholdLine.ts`, `standing.ts`,
core's `sportStanding`, `equivalentRunSpeed`, `gradeAtSpeed` and the zones (`AnalysisSession.zonesAt`).
The zones are cut from a half year, so the twin uses an athlete whose period and half year agree.
