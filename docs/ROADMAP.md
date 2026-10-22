# Roadmap

Deferred work, grouped and in rough priority order within each group. Each item says why it matters.
The architecture is in [ARCHITECTURE.md](ARCHITECTURE.md).

## 1. Headline fairness

Raw ratios label most people as runners, so the headline is the most misleading output today.

1. **Population-relative scoring.** Most people sustain more metabolic power running than cycling,
   so comparing raw ratios says more about the sport than the athlete. Score each sport against
   age-graded running (WMA tables) and cycling power profiles, so the headline answers how strong
   you are for your age and sex. This needs age and sex in the profile.
2. **Reword the headline.** Replace "stronger" and "burns" with neutral wording, for example "your
   best running needs X% more energy per kg than your best cycling", and describe the range as a
   model range. This is cheap and should ship before population scoring, since it removes the most
   misleading claim. Update the README screenshot and its alt text when the wording changes.

## 2. Model accuracy

These change the numbers the headline is built from.

1. **Running air resistance.** Minetti's treadmill cost understates outdoor running by roughly
   3-8% at 4-4.5 m/s. Add `0.5 ρ CdA_run v²` with `CdA_run` around 0.25 m², given a wide prior
   because it is uncertain. This biases the running side of every flat comparison.
2. **Additive cycling resting energy.** Running adds the 1.22 W/kg resting rate and cycling does not,
   so the two sports are not on the same footing. Use `M = 1.22 + P / (η m)` with `η ~ N(0.235, 0.015)`
   and check the prior against the literature before use.
3. **Wider gross-efficiency prior.** The review judged the current spread too narrow. Widen it with
   item 2, because the two interact and change together.
4. **Heart-rate model-discrepancy term.** Raise `HR_MODEL_DISCREPANCY` from 0.05 to about 0.12. The
   current value lets the heart-rate check narrow the range more than the assumption that heart rate
   maps to power the same way in both sports justifies.
5. **Effective sample size.** Report the effective sample size of the importance weights. A few
   heavily weighted draws can make the 90% range look tighter than the data supports.
6. **Sport-specific maximum heart rate.** Cycling maximum is usually a few bpm below running. One
   shared maximum makes the all-out check misjudge cycling efforts.
7. **Virtual-power bias.** The accuracy card shows spread but not direction. A systematic over- or
   under-estimate on climbs moves the ride curve one way, so report signed bias next to the error.
8. **Altitude-dependent air density.** `RHO_AIR` is fixed at sea-level 1.225 kg/m³. At 2,000 m it is
   about 20% lower, which changes virtual power on long climbs. Use elevation from the file when it
   is present.

## 3. Input formats

Most people do not have only FIT files, and the decoder is a licensing problem for distribution.

1. **More file types.** Add GPX (heart rate and power through extensions), TCX, Strava CSV summaries
   and the Apple Health export. Each format removes a reason people cannot compare their sports.
2. **In-house FIT decoder.** The Garmin FIT SDK licence restricts redistribution to third parties,
   and it is about 400 kB of the 470 kB worker bundle. A decoder limited to the message types the app
   reads (file id, session, sport, record) keeps a public demo and any open-source licence clean, and
   shrinks the bundle.

## 4. Engineering cleanup

Cheap changes that reduce the risk of the rest of the list.

1. **Shared Monte Carlo module.** Sampling code is duplicated between the pipeline and `compare`.
   One module means one place to fix a sampling bug.
2. **Remove dead exports.** Trim exports no app uses, so the public surface of each package is what
   the apps depend on.
3. **Shared chart scaffolding.** Finish consolidating the axis, hover and frame code the charts still
   repeat.
4. **Stronger lint rules.** The lint config enables only two React rules. Add the suspicious and perf
   categories, `jsx-a11y`, `exhaustive-deps`, `no-explicit-any` and `eqeqeq`, so the conventions in
   the code are enforced rather than remembered.
5. **Pin CI actions by commit SHA.** The workflow uses version tags such as `actions/checkout@v4`,
   which can be moved. Pinning stops a changed action from running in the build.
6. **Surface Playwright retries.** CI retries each failed test once, which can hide flakiness. Report
   retried tests in the job summary so they stay visible.
7. **LICENSE file.** The repository has none, so the code is all rights reserved by default. This is
   needed before a public demo or any reuse.
8. **Public demo deployment.** The app already ships a sample dataset. Hosting the static build on
   Pages lets people try the comparison without files of their own.

## 5. Product

1. **Shareable profile card.** A read-only link or image showing the headline numbers lets people
   share the comparison. Public links expose only the headline figures, and only after an explicit
   opt-in.
2. **Server-side re-analysis.** Stored originals can be reprocessed when the model changes, without
   asking users to upload again. Parsing FIT files exceeds the free tier's 10 ms CPU limit, so this
   needs the $5/month Workers plan.
3. **Local-only mode.** Let people use the app without an account, as it works today. Some users will
   not want their data stored, and this keeps that option open once accounts exist.

## 6. Activity labelling (opt-in)

Labels would let the headline exclude e-bike rides and treat race efforts as all-out, but they need
a classifier and that raises privacy questions.

1. **Opt-in labelling from titles and summary statistics.** Label race versus training, commute,
   e-bike and all-out effort. Send only titles and summary numbers, never the per-second data, and
   only after the user opts in for each upload. If the classifier is a hosted service, the opt-in must
   name it, because titles would leave the product.
2. **Benchmark before shipping.** Score Decision-1 (Microsoft's decision model, which returns
   probabilities over fixed options and is very cheap) against a keyword baseline on about 200
   hand-labelled activities. If the keyword baseline is as good, ship it and skip the model. A model
   would be the first one in the product, so the README's "no AI model" statement would have to change.

## 7. New sports

These depend on population-relative scoring (section 1, item 1) so that the numbers mean something.

1. **Swimming.** Estimate critical swim speed from pool lengths and express it as a percentile for the
   same sex and age. A third sport turns the comparison into a matrix, so this waits for the scoring.
2. **Strength.** Estimate one-rep max relative to body weight and show it on a separate fitness
   radar axis. The metabolic-power unit does not apply to lifting, so it should not be compared
   directly with running or cycling.
3. **Edge rate limiting.** The API has no per-IP or per-account request limiter. Add Cloudflare rate
   limiting rules in front of `/api/auth/*` and the upload routes before opening sign-up.
