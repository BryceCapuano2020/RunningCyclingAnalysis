CREATE TABLE `r2_storage_budget` (
	`id` integer PRIMARY KEY NOT NULL,
	`lifetime_put_bytes` integer DEFAULT 0 NOT NULL,
	`monthly_period` text NOT NULL,
	`monthly_operations` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
INSERT INTO `r2_storage_budget` (`id`, `lifetime_put_bytes`, `monthly_period`, `monthly_operations`)
SELECT 1, coalesce(sum(`file_size`), 0), strftime('%Y-%m', 'now'), 0 FROM `activities`;
