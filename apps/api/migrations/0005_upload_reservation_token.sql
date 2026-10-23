-- The upload slot of the request holding an activity's file_size reservation. NULL when none is held.
ALTER TABLE `activities` ADD `file_reservation_token` text;
