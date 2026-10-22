ALTER TABLE `sessions` ADD `created_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `activities_user_created_idx` ON `activities` (`user_id`,`created_at`);