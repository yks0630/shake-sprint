CREATE TABLE `player_readiness` (
	`player_id` text PRIMARY KEY NOT NULL,
	`round` integer NOT NULL,
	`ready` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
