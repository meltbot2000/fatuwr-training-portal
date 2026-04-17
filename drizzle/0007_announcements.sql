CREATE TABLE `announcements` (
  `id` int AUTO_INCREMENT NOT NULL,
  `title` varchar(255),
  `imageUrl` varchar(500),
  `position` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `createdBy` varchar(255),
  CONSTRAINT `announcements_id` PRIMARY KEY(`id`)
);
