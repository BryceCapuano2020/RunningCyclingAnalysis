# Evolving capability: model comparison and recommendation

Research note for the capability-tracking feature. [unverified] marks claims not checked against the primary text. DOIs are listed only where a publisher, PubMed, or index record confirmed them.

## Summary

Track one latent value per athlete, sport, and metric (cycling CP, running critical speed, swimming CSS, 1RM per lift). Model it as a random walk on the log scale, with process noise set from published detraining timescales. Treat maximal efforts as noisy measurements and submaximal efforts as lower bounds, using a one-sided censored update. Show demonstrated evidence and estimated capability separately.

## Comparison

| Model                                                                                              | Data needs                              | Identifiability                                       | Transparency                      | Implementation complexity                |
| -------------------------------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------- | --------------------------------- | ---------------------------------------- |
| Banister impulse-response (1975)                                                                   | Dense loads and many performances       | Poor: wide intervals, correlated parameters           | High equations, low trust in fits | Moderate: nonlinear fit, local optima    |
| Busso variable dose-response (1997, 2003)                                                          | As Banister, plus time-varying terms    | Worse: extra fatigue variable                         | Moderate                          | Moderate to high                         |
| Fitness-fatigue with Kalman feedback (Kolossa 2017)                                                | Loads and performances                  | Tracking improved (abstract); identifiability unclear | Moderate                          | High                                     |
| Bayesian Banister with priors (Peng 2023)                                                          | One athlete plus published-value priors | Better than least squares in one case                 | Good if priors are explicit       | High: MCMC                               |
| Local-level Kalman, random walk (recommended)                                                      | Any sparse efforts                      | Good: one state, noise set externally                 | High                              | Low                                      |
| Bayesian DLM or hierarchical (Che; Griffin)                                                        | Many athletes for pooling               | Good through pooling                                  | Moderate                          | High                                     |
| Per-period rolling best (current): a window of a third of the period, between one week and 42 days | Any                                     | Not applicable                                        | High                              | Trivial, but no uncertainty or censoring |

## Evidence by topic

### 1. Banister and its critics

- Banister et al. (1975), Aust J Sports Med 7(3): 57-61. No DOI found [unverified; details from citing papers].
- Busso et al. (1997), J Appl Physiol 82(5): 1685-1693 [DOI unverified]. Time-varying parameters fitted by recursive least squares; two cyclists over 14 weeks.
- Busso (2003), Med Sci Sports Exerc 35(7): 1188-1195 [DOI unverified]. Adds a variable for fatigue size and duration; six untrained volunteers over 15 weeks.
- Hellard et al. (2006), J Sports Sci 24(5): 509-520, doi:10.1080/02640410500244697. Nine elite swimmers: bootstrap intervals for the most useful parameters were wide, and some parameters were too correlated to interpret.
- Marchal et al. (2025), Sci Rep 15: 3706 [DOI unverified]. Bayesian fit with biological priors: fitness and fatigue poorly identifiable; fatigue terms did not significantly improve prediction, on two datasets.

Implication: Banister-type models carry several interacting parameters. Sparse, mostly submaximal data cannot pin them down, so the recommendation uses one state.

### 2. State-space and Kalman models

- Kalman (1960), J Basic Eng 82(1): 35-45, doi:10.1115/1.3662552.
- Kolossa et al. (2017), Int J Comput Sci Sport 16(2): 117-129, doi:10.1515/ijcss-2017-0010. Rewrites the three-time-constant Busso model as a linear, time-varying state space with Kalman updates. The abstract reports better tracking and prediction; magnitudes unchecked.
- Irregular times: discrete-time models handle missing points but not uneven spacing; a continuous-time formulation does (Harvey 1990, as quoted in a 2023 arXiv paper [original unverified]). For a random walk, a gap of Δ days adds variance qΔ. This is exact, with no interpolation. Resampling to a regular grid smooths the data and understates uncertainty (applied paper [unverified]).

### 3. Bayesian dynamic and hierarchical models

- West and Harrison (1997), Bayesian Forecasting and Dynamic Models, 2nd ed., Springer, ISBN 978-0-387-94725-9 [DOI unverified]. Dynamic linear models: Kalman recursions with priors on variances.
- Che et al., arXiv:2205.10746. Bayesian dynamic linear model for latent athlete ability (preprint).
- Peng et al. (2023), preprint doi:10.51224/SRXIV.246; published version doi:10.1080/24748668.2023.2268480, as listed on the preprint page. Bayesian Banister for one runner, more precise than least squares.
- Griffin et al., arXiv:2405.17214. Hierarchical career model; sparse athletes shrink toward the group mean. Needs many athletes.

No hierarchical model of training-driven capability from sparse efforts was found.

### 4. Censored observations

- Tobin (1958), Econometrica 26(1): 24-36, doi:10.2307/1907382. The Tobit model.
- Naive Kalman updates with censored readings bias the state (Allik, University of Delaware [author and details unverified]). Tobit Kalman variants: arXiv:1911.06190 (formulas garbled in extraction; check the PDF) and arXiv:2002.08597.
- Lower bounds on capability: CP model, power = CP + W′/t (Jones et al. 2010, Med Sci Sports Exerc 42: 1876-1890, PMID 20195180 [DOI unverified]); W′ dynamics (Skiba et al. 2012, doi:10.1249/MSS.0b013e3182517a80). Swimming: Wakayoshi et al. (1992), Eur J Appl Physiol 64: 153-157, doi:10.1007/BF00717953 [DOI taken from a 2009 reference list; unverified at publisher].

### 5. Detraining timescales

- Mujika and Padilla (2000), Part I, Sports Med 30(2): 79-87, doi:10.2165/00007256-200030020-00002. Short-term (under 4 weeks) losses, including VO2max and blood volume.
- Mujika and Padilla (2000), Part II, Sports Med 30(3): 145-154, doi:10.2165/00007256-200030030-00001. Long-term; recently gained VO2max is lost completely.
- Mujika and Padilla (2001), Med Sci Sports Exerc 33(3): 413-421, doi:10.1097/00005768-200103000-00013. Gains lost after more than 4 weeks off; metabolic shifts within about 10 days.

These are physiological markers, not CP or 1RM. Applying them to CP is an assumption.

## Recommended model: censored local-level Kalman filter on log capability

Plain language: the app keeps one number per athlete, sport, and metric. A maximal effort says that number is about X. A submaximal effort says it is at least X. Uncertainty grows the longer there is no evidence.

### State

x_t = log capability for one athlete, sport, and metric. Prior mean m0 and variance V0 come from a wide population range [values unverified] and the athlete's first efforts.

### Process noise

After a gap of Δ days, x changes by w, with w ~ N(0, σ²Δ).

- Assumption: recently gained capability G = 3% [unverified; tested by sensitivity].
- Mujika and Padilla: such gains are lost after about T = 28 days off.
- Set the unobserved 1-SD drift over T to G/2: σ = (G/2)/√T = 0.015/√28 ≈ 0.0028 per √day.
- Result: SD 1.5% after 4 weeks, 2.1% after 8 weeks.

The model has no built-in decline. Old evidence loses weight as variance grows. The estimate falls only when efforts show it.

### Observation model

Each effort maps to an implied capability c = p − W/t, where p is power or speed, t is duration in seconds, and W is W′ (cycling) or D′ (running and swimming distance models). Then z = log c. Strength uses z = log(load / f(reps)), with f a published reps-to-1RM equation [unverified].

- Variance: R = (σ_m² + (σ_W/t)²) / c², by the delta method. Short efforts are noisier automatically.
- Maximal effort (declared or from a test protocol): z = x + v, v ~ N(0, R).
- Submaximal effort: a performance sustained for t bounds capability from below, so the event is x + v ≥ z. Likelihood Φ((x − z)/√R), a one-sided Tobit censor. The update uses a truncated-normal moment match (pseudocode below). Treating such efforts as exact biases the estimate low.

### Outputs

- Demonstrated: evidence, not a model output. The best maximal effort in a window is shown as "demonstrated X on date D". Submaximal efforts show as "at least X on date D".
- Estimated capability: exp(m), with range exp(m ± 1.96√V), shown as "estimated X (95% range L to U)". The range widens with time since the last informative effort.
- Check: if a demonstrated maximal value falls outside the estimated range, flag it for review.

### Pseudocode

```text
inputs : efforts sorted by time e.t (days); prior m, V (log scale)
consts : sigma (per sqrt-day), W (W' or D'), sd_W, meas_sd
t_prev = first effort time
for each effort e:
  dt = e.t - t_prev                     # must be >= 0
  V = V + sigma^2 * dt                  # predict; exact for any gap
  c = e.power - W / e.dur               # e.dur in seconds; power or speed
  if c <= 0: continue                   # effort implies no capability
  z = log(c)
  R = (meas_sd^2 + (sd_W / e.dur)^2) / c^2
  S = V + R
  K = V / S
  if e.maximal:                         # z = x + noise
    m = m + K * (z - m)
    V = (1 - K) * V
  else:                                 # x + noise >= z (Tobit lower bound)
    s = sqrt(S)
    a = (z - m) / s
    if a < -6: continue                 # bound already satisfied: no information
    lam = inverseMills(a)               # phi(a) / (1 - Phi(a)), numerically stable
    my = m + s * lam                    # truncated mean of x + noise
    vy = max(0, s^2 * (1 + a * lam - lam^2))
    m = m + K * (my - m)
    V = (1 - K) * V + K^2 * vy
  t_prev = e.t
output: m, V
capability = exp(m); 95% range = exp(m +/- 1.96 * sqrt(V))
```

Implementation note: JavaScript has no built-in erf or erfc. Use a fixed-coefficient approximation so results match across browsers.

## Test strategy (simulated athletes)

1. A seeded PRNG (for example mulberry32) generates truth: random walk, training ramp, and a 4-week, 3% detraining dip.
2. Efforts: Poisson arrivals at 0-3 per week, durations 2-15 min, 80% submaximal, 20% maximal, known measurement SD.
3. Over about 1,000 seeds: bias, RMSE, and 95% interval coverage (target 0.90-0.98). Interval width should rise with gap length.
4. Censoring check: a naive model that treats submaximal efforts as exact should bias low; the censored model should not.
5. Known answers: maximal-only data reproduces the textbook Kalman filter; an already-satisfied bound leaves m and V unchanged; Δ = 0 leaves V unchanged.
6. Grid check: compare the exact posterior on a log-capability grid with the moment-matched update, for a in [-6, 3].
7. Missing data: a 6-month gap raises V by σ²Δ, leaves m unchanged, and produces no NaN.
8. Sensitivity: vary σ and sd_W at 0.5x and 2x; report coverage honestly, including failures.
9. Determinism: identical output across runs; golden fixtures; out-of-order input rejected.
