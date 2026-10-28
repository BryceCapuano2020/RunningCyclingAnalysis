-- Hand-written on purpose, as 0006 and 0007 are. The snapshot is drizzle-kit's, but write any follow-up
-- migration by hand the same way rather than regenerating this file.
-- The athlete's dated settings: a body mass, maximum heart rate or threshold in effect from a local
-- date. A new table, so the Worker that is live now never reads or writes it and stays a rollback
-- target. Rows belong to a user and go with the account through the cascade, so account deletion needs
-- no extra statement. `sport` is '' for the body mass, which belongs to no sport, so the primary key
-- (user, kind, sport, date) has no nulls and a second value for the same date replaces the first.
CREATE TABLE `athlete_measurements` (
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`sport` text DEFAULT '' NOT NULL,
	`from_date` text NOT NULL,
	`value` real NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `kind`, `sport`, `from_date`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "athlete_measurements_kind_check" CHECK("athlete_measurements"."kind" IN ('massKg', 'maxHeartRate', 'thresholdPower', 'thresholdPace')),
	CONSTRAINT "athlete_measurements_sport_check" CHECK("athlete_measurements"."sport" IN ('', 'run', 'ride'))
);
