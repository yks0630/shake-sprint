CREATE TABLE `games` (
	`code` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`host_hash` text NOT NULL,
	`round` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'lobby' NOT NULL,
	`start_at` integer,
	`end_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`room` text NOT NULL,
	`nickname` text NOT NULL,
	`character` integer NOT NULL,
	`token_hash` text NOT NULL,
	`joined_at` integer NOT NULL,
	FOREIGN KEY (`room`) REFERENCES `games`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `players_room` ON `players` (`room`);--> statement-breakpoint
CREATE TABLE `scores` (
	`player_id` text NOT NULL,
	`round` integer NOT NULL,
	`shakes` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`player_id`, `round`),
	FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE no action
);
