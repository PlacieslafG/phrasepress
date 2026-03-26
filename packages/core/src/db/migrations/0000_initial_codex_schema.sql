CREATE TABLE `folio_field_index` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`folio_id` integer NOT NULL,
	`field_name` text NOT NULL,
	`string_value` text,
	`number_value` real,
	FOREIGN KEY (`folio_id`) REFERENCES `folios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ffi_folio_id_idx` ON `folio_field_index` (`folio_id`);--> statement-breakpoint
CREATE INDEX `ffi_field_string_idx` ON `folio_field_index` (`field_name`,`string_value`);--> statement-breakpoint
CREATE INDEX `ffi_field_number_idx` ON `folio_field_index` (`field_name`,`number_value`);--> statement-breakpoint
CREATE TABLE `folio_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`from_folio_id` integer NOT NULL,
	`from_field` text NOT NULL,
	`to_folio_id` integer NOT NULL,
	`to_codex` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`from_folio_id`) REFERENCES `folios`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_folio_id`) REFERENCES `folios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `fl_from_folio_field_idx` ON `folio_links` (`from_folio_id`,`from_field`);--> statement-breakpoint
CREATE INDEX `fl_to_folio_idx` ON `folio_links` (`to_folio_id`);--> statement-breakpoint
CREATE TABLE `folio_revisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`folio_id` integer NOT NULL,
	`stage` text NOT NULL,
	`fields` text NOT NULL,
	`author_id` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`folio_id`) REFERENCES `folios`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `folio_revisions_folio_id_idx` ON `folio_revisions` (`folio_id`);--> statement-breakpoint
CREATE TABLE `folio_terms` (
	`folio_id` integer NOT NULL,
	`term_id` integer NOT NULL,
	PRIMARY KEY(`folio_id`, `term_id`),
	FOREIGN KEY (`folio_id`) REFERENCES `folios`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`term_id`) REFERENCES `terms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `folios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`codex` text NOT NULL,
	`stage` text DEFAULT 'draft' NOT NULL,
	`fields` text DEFAULT '{}' NOT NULL,
	`author_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `folios_codex_stage_idx` ON `folios` (`codex`,`stage`);--> statement-breakpoint
CREATE INDEX `folios_codex_created_at_idx` ON `folios` (`codex`,`created_at`);--> statement-breakpoint
CREATE TABLE `plugin_status` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plugin_name` text NOT NULL,
	`active` integer DEFAULT 0 NOT NULL,
	`activated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_status_plugin_name_unique` ON `plugin_status` (`plugin_name`);--> statement-breakpoint
CREATE TABLE `refresh_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `refresh_tokens_token_hash_unique` ON `refresh_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `refresh_tokens_user_id_idx` ON `refresh_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `roles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`capabilities` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_slug_unique` ON `roles` (`slug`);--> statement-breakpoint
CREATE TABLE `terms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vocabulary_id` integer NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`parent_id` integer,
	FOREIGN KEY (`vocabulary_id`) REFERENCES `vocabularies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `terms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `terms_vocabulary_slug_idx` ON `terms` (`vocabulary_id`,`slug`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role_id` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `vocabularies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`hierarchical` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vocabularies_slug_unique` ON `vocabularies` (`slug`);