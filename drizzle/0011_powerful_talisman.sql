CREATE TABLE `videos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`url` text NOT NULL,
	`postedBy` varchar(255) NOT NULL,
	`postedDate` varchar(32) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `videos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `sheet_users` MODIFY COLUMN `image` mediumtext;--> statement-breakpoint
ALTER TABLE `users` ADD `image` mediumtext;