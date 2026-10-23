CREATE TABLE `daily_budget` (
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	`action` text NOT NULL,
	`used` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `day`, `action`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `pending_account_deletions` (
	`user_id` text PRIMARY KEY NOT NULL,
	`requested_at` integer NOT NULL,
	`sweep_pending` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `upload_slots` (
	`user_id` text NOT NULL,
	`slot_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `slot_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `upload_slots_expires_idx` ON `upload_slots` (`expires_at`);--> statement-breakpoint
-- The monthly PUT ledger starts at zero: bytes written earlier this month were not recorded per month.
ALTER TABLE `r2_storage_budget` ADD `monthly_put_bytes` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `r2_storage_budget` ADD `orphan_sweep_cursor` text;--> statement-breakpoint
ALTER TABLE `users` ADD `activity_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `deleting_at` integer;--> statement-breakpoint
-- Backfill the activity counter from the rows that exist today, so the cap holds for populated data.
UPDATE `users` SET `activity_count` = (SELECT COUNT(*) FROM `activities` WHERE `activities`.`user_id` = `users`.`id`);--> statement-breakpoint
CREATE INDEX `oauth_accounts_user_idx` ON `oauth_accounts` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);