# Owner-caught evals

Each folder here is a miss the owner caught on their own account. The miss is turned into a public
synthetic twin, a test on made-up athletes that fails the way the miss did, so it cannot come back.

## Ownership

The owner owns every case and `RUBRIC.md`. Agents never edit them. A change under this folder needs
the `owner-evals` label on the pull request, and only the owner applies it, by hand.

Two guards hold this (docs/PROCESS.md, Guards). `scripts/ops/agent-guard.mjs` refuses edits and writes
under `evals/owner-caught/` in every session, and the `size` job in CI fails a pull request that
changes this folder without the label.

## A case

- `case.md`: what the owner saw in words, the rule it broke, what the twin checks and which code it
  exercises. It holds no figure, date or description from the owner's account.
- `twin.test.ts`: the twin. It uses synthetic athletes only and calls the same functions the app uses for
  each printed figure.
- `support.ts` builds the synthetic libraries and sessions the twins share.

## Run them

```
.claude/stage-d/testslot.sh npx vitest run --project evals
```

They are the `evals` project in the root `vitest.config.ts`, so the sharded unit jobs in CI run them.
Each test stays under about 2 s; a heavy sweep goes in a `*.sim.test.ts`, which the unit jobs leave out.

## A model ships its own case

A new or changed model adds its own calibration case, by the rule in docs/PROCESS.md, "Formula and
model changes". That rule lives there, not here.
