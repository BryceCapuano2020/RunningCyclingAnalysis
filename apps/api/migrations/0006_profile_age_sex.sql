-- Hand-written on purpose. drizzle-kit would rebuild the whole profiles table to add these columns,
-- so do not regenerate this file with drizzle-kit; write any follow-up migration by hand the same way.
-- Optional age-grading inputs. Both allow null, so the Worker that is live now keeps saving profiles
-- unchanged. The CHECK runs against existing rows, which are all null, so it cannot fail here.
ALTER TABLE `profiles` ADD `birth_year` integer;--> statement-breakpoint
ALTER TABLE `profiles` ADD `sex` text CONSTRAINT `profiles_sex_check` CHECK (`sex` IS NULL OR `sex` IN ('female', 'male'));
