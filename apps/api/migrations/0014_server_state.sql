-- NOT YET APPLIED TO PRODUCTION: the owner approves the migration and applies it before the Worker that
-- reads it is deployed (docs/RELEASES.md).
-- Hand-written after drizzle-kit generated the columns and the table: it does not model triggers, so do not
-- regenerate this file with it.
-- Additive: a new table and two columns no earlier Worker names, so every earlier Worker stays a rollback target.
-- users.library_version is the one counter of every input of the account's server-computed results (design:
-- server-compute.md, decision 5). Triggers raise it for every writer, whatever Worker version is live: an activity
-- inserted or deleted, the profile's masses, year of birth or sex, a dated setting or the account settings. A change to
-- an existing digest has no trigger: D1 counts the rows a trigger changes in the statement's `meta.changes`, which the
-- digest upgrade and the label batch read, so those two raise the counter in their own statements (routes/activities).
-- state_jobs holds the job's progress and the R2 snapshot it points at; a job is dirty while library_version is above
-- computed_version. athlete_settings.zone is the zone the days are cut in, null until the browser reports one.
-- The one backfill marks every account dirty at 1, so the first job of each computes it.
CREATE TABLE `state_jobs` (
	`user_id` text PRIMARY KEY NOT NULL,
	`computed_version` integer DEFAULT 0 NOT NULL,
	`computed_at` integer DEFAULT 0 NOT NULL,
	`snapshot_hash` text,
	`snapshot_version` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
ALTER TABLE `athlete_settings` ADD `zone` text;--> statement-breakpoint
ALTER TABLE `users` ADD `library_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE TRIGGER `activities_library_version_insert` AFTER INSERT ON `activities`
BEGIN
	UPDATE `users` SET `library_version` = `library_version` + 1 WHERE `id` = NEW.`user_id`;
END;--> statement-breakpoint
CREATE TRIGGER `activities_library_version_delete` AFTER DELETE ON `activities`
BEGIN
	UPDATE `users` SET `library_version` = `library_version` + 1 WHERE `id` = OLD.`user_id`;
END;--> statement-breakpoint
CREATE TRIGGER `profiles_library_version_insert` AFTER INSERT ON `profiles`
BEGIN
	UPDATE `users` SET `library_version` = `library_version` + 1 WHERE `id` = NEW.`user_id`;
END;--> statement-breakpoint
CREATE TRIGGER `profiles_library_version_update` AFTER UPDATE OF `mass_kg`, `bike_mass_kg`, `birth_year`, `sex` ON `profiles`
WHEN OLD.`mass_kg` IS NOT NEW.`mass_kg` OR OLD.`bike_mass_kg` IS NOT NEW.`bike_mass_kg` OR OLD.`birth_year` IS NOT NEW.`birth_year` OR OLD.`sex` IS NOT NEW.`sex`
BEGIN
	UPDATE `users` SET `library_version` = `library_version` + 1 WHERE `id` = NEW.`user_id`;
END;--> statement-breakpoint
CREATE TRIGGER `measurements_library_version_insert` AFTER INSERT ON `athlete_measurements`
BEGIN
	UPDATE `users` SET `library_version` = `library_version` + 1 WHERE `id` = NEW.`user_id`;
END;--> statement-breakpoint
CREATE TRIGGER `measurements_library_version_update` AFTER UPDATE OF `value` ON `athlete_measurements`
WHEN OLD.`value` <> NEW.`value`
BEGIN
	UPDATE `users` SET `library_version` = `library_version` + 1 WHERE `id` = NEW.`user_id`;
END;--> statement-breakpoint
CREATE TRIGGER `measurements_library_version_delete` AFTER DELETE ON `athlete_measurements`
BEGIN
	UPDATE `users` SET `library_version` = `library_version` + 1 WHERE `id` = OLD.`user_id`;
END;--> statement-breakpoint
CREATE TRIGGER `settings_library_version_insert` AFTER INSERT ON `athlete_settings`
BEGIN
	UPDATE `users` SET `library_version` = `library_version` + 1 WHERE `id` = NEW.`user_id`;
END;--> statement-breakpoint
CREATE TRIGGER `settings_library_version_update` AFTER UPDATE OF `keep_power`, `counted_runs`, `period`, `zone` ON `athlete_settings`
WHEN OLD.`keep_power` IS NOT NEW.`keep_power` OR OLD.`counted_runs` IS NOT NEW.`counted_runs` OR OLD.`period` IS NOT NEW.`period` OR OLD.`zone` IS NOT NEW.`zone`
BEGIN
	UPDATE `users` SET `library_version` = `library_version` + 1 WHERE `id` = NEW.`user_id`;
END;--> statement-breakpoint
UPDATE `users` SET `library_version` = 1 WHERE `library_version` = 0;
