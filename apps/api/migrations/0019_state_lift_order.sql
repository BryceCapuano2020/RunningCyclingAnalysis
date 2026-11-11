-- NOT YET APPLIED TO PRODUCTION: the owner approves the migration and applies it before the Worker that
-- reads it is deployed (docs/RELEASES.md).
-- Additive: two defaulted columns on state_jobs that no earlier Worker names, so every earlier Worker stays a rollback
-- target. snapshot_lift_revision and snapshot_now_ms order the stored snapshot (with snapshot_version and analysis_revision) by the lift revision and the
-- instant it was computed for. 0 for every row now, so each account computes once on its first open.
ALTER TABLE `state_jobs` ADD `snapshot_lift_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `state_jobs` ADD `snapshot_now_ms` integer DEFAULT 0 NOT NULL;