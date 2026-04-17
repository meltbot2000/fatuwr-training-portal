ALTER TABLE `sheet_sessions` ADD `venueCost` double DEFAULT 0;--> statement-breakpoint
ALTER TABLE `sheet_sessions` ADD `revenue` double DEFAULT 0;--> statement-breakpoint
ALTER TABLE `sheet_sessions` ADD `rainOff` varchar(16) DEFAULT '';