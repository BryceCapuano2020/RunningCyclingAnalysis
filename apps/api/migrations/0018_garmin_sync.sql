-- NOT YET APPLIED TO PRODUCTION: the owner approves the migration and applies it before the Worker that
-- reads it is deployed (docs/RELEASES.md).
-- Additive: two new tables and one column with a default, none of which an earlier Worker names, so every earlier
-- Worker stays a rollback target (its inserts into activities name their columns, and get 'file').
-- Garmin sync (docs/design/garmin-sync.md decision 2), switched off behind GARMIN_ENABLED: provider_links holds an
-- account's encrypted Garmin tokens, inbox_items the ingest ledger, activities.source where an activity came from.
CREATE TABLE `inbox_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_activity_id` text NOT NULL,
	`file_key` text,
	`file_size` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`reason` text,
	`received_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "inbox_items_state_check" CHECK("inbox_items"."state" IN ('pending', 'done', 'failed')),
	CONSTRAINT "inbox_items_file_size_check" CHECK("inbox_items"."file_size" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inbox_items_user_provider_activity_unique` ON `inbox_items` (`user_id`,`provider`,`provider_activity_id`);--> statement-breakpoint
CREATE INDEX `inbox_items_state_received_idx` ON `inbox_items` (`state`,`received_at`);--> statement-breakpoint
CREATE TABLE `provider_links` (
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_user_id` text NOT NULL,
	`token_ciphertext` text NOT NULL,
	`key_id` text NOT NULL,
	`scopes` text NOT NULL,
	`linked_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `provider`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_links_provider_user_unique` ON `provider_links` (`provider`,`provider_user_id`);--> statement-breakpoint
ALTER TABLE `activities` ADD `source` text DEFAULT 'file' NOT NULL;