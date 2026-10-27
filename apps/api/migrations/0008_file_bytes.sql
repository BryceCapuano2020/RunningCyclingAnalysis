-- Original-file bytes per user, so an upload checks one counter in place of summing every row.
-- The counter is the sum of the user's activities.file_size, which counts a reservation (a size
-- with no file key yet) as the quota always has. Three triggers on activities keep it exact for
-- every writer, whatever Worker version is live during a release. Hand-written after drizzle-kit
-- added the column: it does not model triggers, so do not regenerate this file with it.
-- The triggers come before the backfill. The backfill is one statement that reads the truth from
-- activities, so a write that lands between the steps is counted once, by one or the other.
ALTER TABLE `users` ADD `file_bytes` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE TRIGGER `activities_file_bytes_insert` AFTER INSERT ON `activities`
WHEN NEW.`file_size` IS NOT NULL
BEGIN
	UPDATE `users` SET `file_bytes` = `file_bytes` + NEW.`file_size` WHERE `id` = NEW.`user_id`;
END;--> statement-breakpoint
CREATE TRIGGER `activities_file_bytes_update` AFTER UPDATE OF `file_size` ON `activities`
WHEN coalesce(OLD.`file_size`, 0) <> coalesce(NEW.`file_size`, 0)
BEGIN
	UPDATE `users` SET `file_bytes` = `file_bytes` + coalesce(NEW.`file_size`, 0) - coalesce(OLD.`file_size`, 0)
		WHERE `id` = NEW.`user_id`;
END;--> statement-breakpoint
CREATE TRIGGER `activities_file_bytes_delete` AFTER DELETE ON `activities`
WHEN OLD.`file_size` IS NOT NULL
BEGIN
	UPDATE `users` SET `file_bytes` = `file_bytes` - OLD.`file_size` WHERE `id` = OLD.`user_id`;
END;--> statement-breakpoint
UPDATE `users` SET `file_bytes` = (SELECT coalesce(sum(`file_size`), 0) FROM `activities` WHERE `activities`.`user_id` = `users`.`id`);
