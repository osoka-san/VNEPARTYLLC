CREATE TABLE `qr_pattern_versions` (
	`pattern_id` text NOT NULL,
	`version` integer NOT NULL,
	`recipe` text NOT NULL,
	`search_text` text NOT NULL,
	`engine_version` text NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`operation_id` text NOT NULL,
	PRIMARY KEY(`pattern_id`, `version`),
	CONSTRAINT "qr_pattern_version_positive" CHECK("qr_pattern_versions"."version" > 0),
	CONSTRAINT "qr_pattern_archived_boolean" CHECK("qr_pattern_versions"."archived" IN (0,1)),
	CONSTRAINT "qr_pattern_recipe_json" CHECK(json_valid("qr_pattern_versions"."recipe"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `qr_pattern_operation_unique` ON `qr_pattern_versions` (`operation_id`);