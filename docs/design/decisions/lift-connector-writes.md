# The connector may not save lift logs yet

Stage X, 6 Nov 2026. Open question 3 of [strength.md](../strength.md), section 4; ROADMAP.md, Phase 3.

## Decision

Deferred. The connector reads lifts and estimates when it exists, and writes none. Lift logs come from the
in-app logger and the plain lifting CSV only.

## Why

- The connector is designed read-only (stage E). A write tool needs its own scope, consent wording, budget and
  an idempotent key, none of which exist.
- Sets written by an assistant could be invented. The connector's eval scores invented numbers in answers; it
  has no check yet for invented sets in the athlete's record, and the record is what every estimate reads.
- The CSV path covers the use case: an assistant can fill a lifting CSV, and the athlete imports it and sees
  the count of sets added and replaced before anything is stored.

## How to reverse

Add a write tool that calls the same `PUT /api/lifts` with the athlete's confirmation, once the connector and
its eval exist. Nothing stored changes, so this is open for the stage that builds the connector.
