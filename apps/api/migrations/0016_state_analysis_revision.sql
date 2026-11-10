-- NOT YET APPLIED TO PRODUCTION: the owner approves the migration and applies it before the Worker that
-- reads it is deployed (docs/RELEASES.md).
-- Additive: one defaulted column on state_jobs that no earlier Worker names, so every earlier Worker stays a rollback
-- target. analysis_revision is the combine-time analysis revision (core ANALYSIS_REVISION) the account's snapshot was
-- computed under; 0 for every row now, so each listed account is stale and computes again under this build's revision.
ALTER TABLE `state_jobs` ADD `analysis_revision` integer DEFAULT 0 NOT NULL;