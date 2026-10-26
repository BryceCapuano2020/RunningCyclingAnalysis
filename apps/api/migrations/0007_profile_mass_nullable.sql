-- Hand-written on purpose, as 0006 is. drizzle-kit would rebuild the profiles table the same way, so
-- do not regenerate this file with drizzle-kit; write any follow-up migration by hand the same way.
-- SQLite cannot drop NOT NULL from a column in place, so profiles is rebuilt. Every row is copied as
-- it is, so a body mass already stored (including the 75 kg that profiles saved before this held) is
-- kept. The columns keep their order, and nothing references profiles, so dropping it removes no
-- other row. The Worker that is live now still writes a body mass, so it keeps working.
CREATE TABLE `profiles_new` (
	`user_id` text PRIMARY KEY NOT NULL,
	`mass_kg` real,
	`bike_mass_kg` real NOT NULL,
	`units` text NOT NULL,
	`keep_files` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`birth_year` integer,
	`sex` text CONSTRAINT `profiles_sex_check` CHECK (`sex` IS NULL OR `sex` IN ('female', 'male')),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `profiles_new` (`user_id`, `mass_kg`, `bike_mass_kg`, `units`, `keep_files`, `updated_at`, `birth_year`, `sex`)
	SELECT `user_id`, `mass_kg`, `bike_mass_kg`, `units`, `keep_files`, `updated_at`, `birth_year`, `sex`
	FROM `profiles`;--> statement-breakpoint
DROP TABLE `profiles`;--> statement-breakpoint
ALTER TABLE `profiles_new` RENAME TO `profiles`;
