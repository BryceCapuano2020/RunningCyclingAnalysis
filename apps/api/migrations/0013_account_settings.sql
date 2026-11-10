-- NOT YET APPLIED TO PRODUCTION: the owner approves the migration and applies it before the Worker that
-- writes it is deployed (docs/RELEASES.md).
-- Additive: a new table no earlier Worker reads or writes, so the Worker that is live now stays a rollback
-- target. Rows go with the account through the cascade. No data is migrated: the choices are in each
-- browser's storage today, and the web saves them to the account on the first sign-in that has none.
-- athlete_settings: the rides whose power is kept, the runs counted at walking pace and the period choice,
-- each as JSON text and null until first set (design: server-compute.md, decision 10).
CREATE TABLE `athlete_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`keep_power` text,
	`counted_runs` text,
	`period` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
