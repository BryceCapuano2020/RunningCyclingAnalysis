# Two thresholds on one card

**What the owner saw.** A card showed a sport's threshold beside a different figure for the same thing:
the ride's grade sat next to a ride number that was not the one the grade came from.

**The rule it broke.** One figure, one function: the same formula everywhere (docs/ENGINEERING.md, "One
figure, one function"), so no surface works out its own copy of a threshold.

**What the twin checks.** For a synthetic athlete who gains through three years, over the default period and
All time, each sport's threshold as printed on the card and drawn on the curve is one value, within half
a second or half a watt of the card. The run's grade is the grade of the printed pace. The ride's grade is the grade of
the ride as a run, and the ride as a run is the run the printed watts are worth.

**Code it exercises.** `apps/web/src/ui/records.ts` (`threshold`), `thresholdLine.ts`, `standing.ts`,
core's `sportStanding`, `equivalentRunSpeed`, `gradeAtSpeed` and the zones (`AnalysisSession.zonesAt`).
The zones are cut from a settled half year, which lags a gaining athlete's period by design, so
they are held to the card for a steady athlete, within half a second or half a watt.
