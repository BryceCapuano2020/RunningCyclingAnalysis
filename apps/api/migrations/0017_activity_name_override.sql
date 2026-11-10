-- NOT YET APPLIED TO PRODUCTION: the owner approves the migration and applies it before the Worker that
-- reads it is deployed (docs/RELEASES.md).
-- Additive: one nullable column on activities that no earlier Worker names, so every earlier Worker stays a rollback
-- target. name_override is the name the athlete gave the activity; null for every row now, so every activity keeps the
-- name its file gave until the athlete renames it. A rebuilt digest does not carry it, so a rebuild puts it back.
ALTER TABLE `activities` ADD `name_override` text;
