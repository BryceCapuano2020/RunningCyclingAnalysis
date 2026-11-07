-- NOT YET APPLIED TO PRODUCTION: the owner approves the migration and applies it before the Worker that
-- writes it is deployed (docs/RELEASES.md).
-- Hand-written on purpose, as 0009 is: drizzle-kit would rebuild `users` (drop and copy) to add the check,
-- which cascades from a table every row references. ALTER TABLE ADD COLUMN adds the named check in place.
-- The snapshot is drizzle-kit's. Additive: a new table and defaulted columns, so the Worker that is live
-- now never reads or writes them and stays a rollback target.
-- lift_sets: one row per logged set, keyed by date, exercise, equipment and set order. Rows go with the
-- account through the cascade, so account deletion needs no extra statement.
-- users.lift_count is kept equal to the account's row count by the same batch that changes the rows; the
-- cap lives in the check, so raising it is a migration.
CREATE TABLE `lift_sets` (
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`exercise` text NOT NULL,
	`equipment` text NOT NULL,
	`set_order` integer NOT NULL,
	`reps` integer NOT NULL,
	`load_kg` real NOT NULL,
	`rpe` real,
	`warmup` integer DEFAULT 0 NOT NULL,
	`time` text,
	`time_precision` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `date`, `exercise`, `equipment`, `set_order`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "lift_sets_equipment_check" CHECK("lift_sets"."equipment" IN ('barbell', 'dumbbell', 'machine', 'smith', 'cable', 'kettlebell', 'bodyweight', 'other')),
	CONSTRAINT "lift_sets_time_precision_check" CHECK("lift_sets"."time_precision" IS NULL OR "lift_sets"."time_precision" IN ('set', 'session')),
	CONSTRAINT "lift_sets_time_pair_check" CHECK(("lift_sets"."time" IS NULL) = ("lift_sets"."time_precision" IS NULL))
);
--> statement-breakpoint
ALTER TABLE `users` ADD `lift_count` integer DEFAULT 0 NOT NULL CONSTRAINT "users_lift_count_cap" CHECK (`lift_count` BETWEEN 0 AND 60000);
--> statement-breakpoint
ALTER TABLE `users` ADD `lift_revision` integer DEFAULT 0 NOT NULL;
