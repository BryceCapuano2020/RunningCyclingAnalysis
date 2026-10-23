-- Digest JSON bytes per user, and the last-seen D1 database size. The byte counter starts at the
-- bytes each user's existing activities already hold.
ALTER TABLE `users` ADD `digest_bytes` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `list_cursor` text;--> statement-breakpoint
ALTER TABLE `r2_storage_budget` ADD `d1_size_bytes` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `users` SET `digest_bytes` = (SELECT coalesce(sum(length(CAST(`digest_json` AS BLOB))), 0) FROM `activities` WHERE `activities`.`user_id` = `users`.`id`);
