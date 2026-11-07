# Relative strength may use the profile's body mass, at the widest mass error

Stage X, 6 Nov 2026. [e1rm.md](../e1rm.md), section 4, covered dated masses only.

## Decision

With no dated body mass, the profile's mass is used, at the capped mass error (0.04 in log units) and with no
age shown. A placeholder mass the app assumed is never used: relative strength is then absent.

## Why

- The profile mass is one the athlete entered, so it is their figure. It has no date, so its age is unknown and
  the widest error is the honest width.
- Leaving relative strength out for every athlete who never dated a mass would hide a figure they can have.

## How to reverse

In `relative.ts`, return null when no dated mass exists. No stored data changes.
