CREATE TABLE `sheet_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`paymentId` varchar(128) DEFAULT '',
	`reference` text,
	`amount` double NOT NULL,
	`date` varchar(64) DEFAULT '',
	`email` varchar(320) DEFAULT '',
	`syncedAt` timestamp DEFAULT (now()),
	CONSTRAINT `sheet_payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sheet_sessions` (
	`rowIndex` int NOT NULL,
	`trainingDate` varchar(64) NOT NULL,
	`day` varchar(32) DEFAULT '',
	`trainingTime` varchar(64) DEFAULT '',
	`pool` varchar(128) DEFAULT '',
	`poolImageUrl` text,
	`memberFee` double DEFAULT 0,
	`nonMemberFee` double DEFAULT 0,
	`memberSwimFee` double DEFAULT 0,
	`nonMemberSwimFee` double DEFAULT 0,
	`studentFee` double DEFAULT 0,
	`studentSwimFee` double DEFAULT 0,
	`trainerFee` double DEFAULT 0,
	`notes` text,
	`rowId` varchar(64) DEFAULT '',
	`attendance` int DEFAULT 0,
	`isClosed` varchar(64) DEFAULT '',
	`trainingObjective` text,
	`signUpCloseTime` varchar(64) DEFAULT '',
	`syncedAt` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sheet_sessions_rowIndex` PRIMARY KEY(`rowIndex`)
);
--> statement-breakpoint
CREATE TABLE `sheet_signups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(256) DEFAULT '',
	`email` varchar(320) DEFAULT '',
	`paymentId` varchar(128) DEFAULT '',
	`dateTimeOfSignUp` varchar(64) DEFAULT '',
	`pool` varchar(128) DEFAULT '',
	`dateOfTraining` varchar(64) DEFAULT '',
	`activity` varchar(128) DEFAULT '',
	`activityValue` varchar(128) DEFAULT '',
	`baseFee` double DEFAULT 0,
	`actualFees` double DEFAULT 0,
	`memberOnTrainingDate` varchar(64) DEFAULT '',
	`syncedAt` timestamp DEFAULT (now()),
	CONSTRAINT `sheet_signups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sheet_users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sheetId` varchar(64) DEFAULT '',
	`name` varchar(256) DEFAULT '',
	`userEmail` varchar(320) DEFAULT '',
	`email` varchar(320) NOT NULL,
	`image` text,
	`paymentId` varchar(128) DEFAULT '',
	`memberStatus` varchar(64) DEFAULT 'Non-Member',
	`clubRole` varchar(64) DEFAULT '',
	`trialStartDate` varchar(64) DEFAULT '',
	`trialEndDate` varchar(64) DEFAULT '',
	`syncedAt` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sheet_users_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `otp_codes` MODIFY COLUMN `expiresAt` timestamp(0) NOT NULL;--> statement-breakpoint
ALTER TABLE `otp_codes` MODIFY COLUMN `createdAt` timestamp(0) NOT NULL DEFAULT (now());