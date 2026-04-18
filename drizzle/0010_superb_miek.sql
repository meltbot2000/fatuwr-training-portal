CREATE TABLE `merch_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`memberPrice` varchar(255) DEFAULT '',
	`nonMemberPrice` varchar(255) DEFAULT '',
	`photo1` mediumtext,
	`photo2` mediumtext,
	`availableSizes` varchar(512) DEFAULT '',
	`howToPurchase` text,
	`inventory` text,
	`sortOrder` double DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `merch_items_id` PRIMARY KEY(`id`)
);
