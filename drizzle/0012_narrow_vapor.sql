ALTER TABLE `videos` ADD `notes` text;--> statement-breakpoint
CREATE INDEX `idx_otp_codes_email` ON `otp_codes` (`email`);--> statement-breakpoint
CREATE INDEX `idx_sheet_payments_payment_id` ON `sheet_payments` (`paymentId`);--> statement-breakpoint
CREATE INDEX `idx_sheet_payments_email` ON `sheet_payments` (`email`);--> statement-breakpoint
CREATE INDEX `idx_sheet_sessions_row_id` ON `sheet_sessions` (`rowId`);--> statement-breakpoint
CREATE INDEX `idx_sheet_signups_pool_date` ON `sheet_signups` (`pool`,`dateOfTraining`);--> statement-breakpoint
CREATE INDEX `idx_sheet_signups_email` ON `sheet_signups` (`email`);--> statement-breakpoint
CREATE INDEX `idx_sheet_signups_payment_id` ON `sheet_signups` (`paymentId`);--> statement-breakpoint
CREATE INDEX `idx_sheet_users_email` ON `sheet_users` (`email`);--> statement-breakpoint
CREATE INDEX `idx_sheet_users_user_email` ON `sheet_users` (`userEmail`);--> statement-breakpoint
CREATE INDEX `idx_sheet_users_payment_id` ON `sheet_users` (`paymentId`);--> statement-breakpoint
CREATE INDEX `idx_users_email` ON `users` (`email`);