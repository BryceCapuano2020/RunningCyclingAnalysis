# Core library benchmark

Run `npm run benchmark:core` from the repository root. By default it generates and digests a
deterministic five-year library of four activities per week, then measures one first combine and
five combines for each of three athlete settings. The workload alternates runs and rides, includes
measured- and virtual-power cycling, and uses one-hour sessions, 75-minute rides, and a two-hour
session every eighth activity.

The JSON output records activity and sample counts, Node/platform/CPU details, wall and process CPU
time for digesting and combining, median/min/max setting-change latency, and process memory. RSS
includes V8 and native allocations; `maxRssMiB` is the process peak, while heap and array-buffer
values are sampled after the measured work. Timings are local reference measurements, not CI
thresholds. Optional `--years=` and `--sessions-per-week=` arguments scale the workload.
