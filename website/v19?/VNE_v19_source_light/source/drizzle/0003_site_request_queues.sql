CREATE TABLE `site_review_request_history` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`action` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`note` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `site_review_requests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `site_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `site_review_request_history_operation_id_unique` ON `site_review_request_history` (`operation_id`);--> statement-breakpoint
CREATE INDEX `site_request_history_order_idx` ON `site_review_request_history` (`request_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `site_review_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`telegram` text NOT NULL,
	`event_key` text NOT NULL,
	`event_title` text NOT NULL,
	`details` text NOT NULL,
	`search_text` text NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`source` text NOT NULL,
	`consent_version` text NOT NULL,
	`fingerprint` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `site_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "site_review_requests_kind" CHECK("site_review_requests"."kind" IN ('membership','event')),
	CONSTRAINT "site_review_requests_status" CHECK("site_review_requests"."status" IN ('submitted','under_review','needs_info','waitlisted','approved','rejected')),
	CONSTRAINT "site_review_requests_version" CHECK("site_review_requests"."version" > 0)
);
--> statement-breakpoint
CREATE INDEX `site_review_requests_queue_idx` ON `site_review_requests` (`kind`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `site_review_requests_actor_idx` ON `site_review_requests` (`created_by`,`created_at`);--> statement-breakpoint
-- Extend only the owner and the explicitly provisioned test-review identity.
UPDATE staff_assignments SET permissions = json_insert(permissions, '$[#]', 'requests.read')
WHERE (role = 'owner' OR (account_id = 'site-review-testrev1' AND role = 'reviewer' AND EXISTS (SELECT 1 FROM json_each(permissions) WHERE value = 'admin.view')))
AND NOT EXISTS (SELECT 1 FROM json_each(permissions) WHERE value = 'requests.read');
--> statement-breakpoint
UPDATE staff_assignments SET permissions = json_insert(permissions, '$[#]', 'requests.manage')
WHERE role = 'owner' AND NOT EXISTS (SELECT 1 FROM json_each(permissions) WHERE value = 'requests.manage');
