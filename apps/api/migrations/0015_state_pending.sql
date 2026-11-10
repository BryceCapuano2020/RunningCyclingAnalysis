-- NOT YET APPLIED TO PRODUCTION: the owner approves the migration and applies it before the Worker that
-- reads it is deployed (docs/RELEASES.md).
-- Additive: two defaulted columns on state_jobs that no earlier Worker names, so every earlier Worker stays a rollback
-- target. attempted_at is when the account's last compute began, a failed one included, so a burst of retries waits out
-- the minimum interval instead of recomputing. pending_until is until when a message for the account is on its way, so
-- a burst of writes (an import) sends one message, not one per write.
ALTER TABLE `state_jobs` ADD `attempted_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `state_jobs` ADD `pending_until` integer DEFAULT 0 NOT NULL;