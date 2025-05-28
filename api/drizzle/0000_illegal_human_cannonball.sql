CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`user_id` text NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL
);
