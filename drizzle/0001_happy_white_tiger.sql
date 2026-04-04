ALTER TABLE `users` ADD `paymentId` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD `clubRole` varchar(32) DEFAULT '';--> statement-breakpoint
ALTER TABLE `users` ADD `trialStartDate` varchar(32) DEFAULT '';--> statement-breakpoint
ALTER TABLE `users` ADD `trialEndDate` varchar(32) DEFAULT '';