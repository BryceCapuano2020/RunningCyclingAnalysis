# Signed-in replica

A developer tool. It loads one account's download into a local copy of the app, signs in, and writes
down what every page and period says. Run it before a release to see what a real account sees. A fresh
e2e account cannot show that: the odd gaps, the long history, the cards that hold a figure back.

It never touches production. Everything runs on your machine: a local Worker with a fresh local
database, and a headless browser that can reach nothing else.

## Private data

A real download holds real activity data, and so does everything the tool writes: page text,
screenshots and the local database. Real downloads and outputs never enter the repository, a pull
request, an issue or a commit message. That includes figures read from them, such as a pace, a date or a
count. Report what you found in chat, not in the repo.

Git ignores `.replica-out/` (the default output folder) and any `*rca-export*.json` file. Keep other
outputs and truth files for real accounts somewhere git does not look.

## Try it on synthetic data

```sh
npm ci
npm run build
npx playwright install chromium   # once
node --import tsx scripts/replica/synth-download.mjs
node scripts/replica/replica.mjs .replica-out/synthetic.rca-export.json
```

`synth-download.mjs` digests the activity files in `apps/web/e2e/fixtures/sample-export.zip` (15
activities) and wraps them in the download format. The replica run takes about 100 seconds on that
download. A large library takes longer.

## Run it on a real account

1. In the app, open Profile and choose "Download my data". The file is named `rca-export-YYYY-MM-DD.json`.
2. Build the checkout you want to look at: `npm ci && npm run build`.
3. Run `node scripts/replica/replica.mjs <download.json>`.

```
node scripts/replica/replica.mjs <download.json> [--out <dir>] [--checkout <dir>]
```

- `--out` is where the output goes. The default is `.replica-out/` in the checkout.
- `--checkout` is the checkout whose `apps/web/dist` is built. The default is the one the script is in.
- `RCA_TESTSLOT` is optional. Set it to an executable that runs its arguments once a machine-wide test
  slot is free, and the script re-runs under it. Use it on a shared machine.
- Exit codes: 0 the run finished, 1 the run failed (partial output stays in the folder), 2 bad usage or a
  missing input.

What the script does:

1. Starts `wrangler dev` from `apps/api` on a free port, with a fresh local D1 in `<out>/.state`. It
   copies `apps/api/.dev.vars.example` to the git-ignored `.dev.vars` when that file is missing.
2. Signs in as `replica@example.test` through dev-login. Writes the profile, the dated measurements
   (`PUT /api/measurements`) and every activity digest through the same API the app uses. The
   download carries digests, not original files.
3. Opens the app signed in, with every other network request blocked, and visits each page for the
   default period and for each of 6 weeks, 12 weeks, 6 months, 12 months and all time.

## Output

| File                                        | What it holds                                                                                                                                                                    |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<page>-<period>.txt`                       | The page's main text, one line per row. Pages: balance, run, ride, history, activities, profile. Periods: `default`, `6-weeks`, `12-weeks`, `6-months`, `12-months`, `all-time`. |
| `<page>-default.png`, `<page>-all-time.png` | Full-page screenshots.                                                                                                                                                           |
| `seed.json`                                 | What was loaded, and what the API refused, with its reason.                                                                                                                      |
| `console.txt`                               | Console errors and warnings, page errors, and blocked requests.                                                                                                                  |
| `counts.tsv`                                | Lines per page and period, and how many say the app holds a figure back.                                                                                                         |
| `withheld.txt`                              | Those lines, grouped by page and period.                                                                                                                                         |
| `run.json`                                  | Commit, seconds taken, activities loaded and refused, console errors.                                                                                                            |

History and profile have no period control, so their period files repeat the page.

## Check a run against what you know

`truth-check.mjs` compares a run with a JSON file of values you know are right, and fails a card that
carries a hedge word.

```
node scripts/replica/truth-check.mjs <replica-out> <truth.json>
```

For each check and period it reads `<page>-<period>.txt`, finds the line that starts with the card
title (any case), and takes the first number followed by the unit within the next 11 lines. The number
may sit on the unit's line or on the line before it. It passes when the number is within `tolerance` of
`expect`. A clock value such as `4:08` or `1:05:30` reads as seconds, so write a pace as seconds. It
fails when a hedge word appears between the title and the number. Exit codes: 0 every check passes, 1 a
check fails or its file is missing, 2 bad usage or a truth file in the wrong format.

This example fits the synthetic download above:

```json
{
  "hedges": { "words": ["ROUGHLY", "ABOUT", "MAYBE"] },
  "checks": [
    {
      "id": "ride-threshold-power",
      "page": "ride",
      "card": "Threshold power",
      "unit": "W",
      "periods": ["default", "all-time"],
      "expect": 225,
      "tolerance": 5
    },
    {
      "id": "run-threshold-pace",
      "page": "run",
      "card": "Threshold pace",
      "unit": "/km",
      "periods": ["default", "all-time"],
      "expect": 248,
      "tolerance": 5
    }
  ]
}
```

Its output:

```
PASS ride-threshold-power default: 225 W, want 225 ± 5
PASS ride-threshold-power all-time: 225 W, want 225 ± 5
PASS run-threshold-pace default: 248 /km, want 248 ± 5
PASS run-threshold-pace all-time: 248 /km, want 248 ± 5
all checks pass
```

The figures come from the synthetic download and move when the model does. A truth file for a real
account holds real figures: keep it outside git.

## Tests

`scripts/replica/truth-check.test.mjs` runs the card reader on synthetic text, and
`scripts/replica/privacy.test.mjs` checks the ignore rules. Both run in `npm run test:ops`. The replica
run itself takes minutes and a browser, so CI does not run it.
