# Lean against the ride as a run

**What the owner saw.** Balance leaned toward one sport while the "Your ride as a run" card said the
other: the ride as a run was slower than the run threshold, yet the lean named cycling.

**The rule it broke.** Every figure on a page is one standing (`sportStanding`), so the lean and the two
pace cards a reader puts side by side cannot disagree.

**What the twin checks.** Synthetic athletes with the run fixed and the ride swept from far under it to far
over it, so the lean falls toward running, toward cycling and level. The lead must equal the run card's whole percent less the ride-as-a-run card's, on a sweep in
0.01 steps of the ride's scale near level. Where the lean is running, the ride
as a run is no faster than the run threshold. Where it is cycling, no slower. Where it is level, within
a few percent of pace. All compared as printed, to the second, and the sweep must reach all three leans.

**Code it exercises.** Core's `sportStanding` and `leanOfLead`, `apps/web/src/ui/standing.ts`, and
`@rca/core/units` pace formatting.
