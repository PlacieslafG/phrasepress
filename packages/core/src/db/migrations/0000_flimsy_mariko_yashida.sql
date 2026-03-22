CREATE TABLE `plugin_status` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plugin_name` text NOT NULL,
	`active` integer DEFAULT 0 NOT NULL,
	`activated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_status_plugin_name_unique` ON `plugin_status` (`plugin_name`);--> statement-breakpoint
CREATE TABLE `post_field_index` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`post_id` integer NOT NULL,
	`field_name` text NOT NULL,
	`string_value` text,
	`number_value` real,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pfi_post_id_idx` ON `post_field_index` (`post_id`);--> statement-breakpoint
CREATE INDEX `pfi_field_string_idx` ON `post_field_index` (`field_name`,`string_value`);--> statement-breakpoint
CREATE INDEX `pfi_field_number_idx` ON `post_field_index` (`field_name`,`number_value`);--> statement-breakpoint
CREATE TABLE `post_revisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`post_id` integer NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`content` text NOT NULL,
	`fields` text NOT NULL,
	`status` text NOT NULL,
	`author_id` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `post_revisions_post_id_idx` ON `post_revisions` (`post_id`);--> statement-breakpoint
CREATE TABLE `post_terms` (
	`post_id` integer NOT NULL,
	`term_id` integer NOT NULL,
	PRIMARY KEY(`post_id`, `term_id`),
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`term_id`) REFERENCES `terms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`post_type` text NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`fields` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`author_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `posts_post_type_slug_idx` ON `posts` (`post_type`,`slug`);--> statement-breakpoint
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
CREATE TABLE `taxonomies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`hierarchical` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `taxonomies_slug_unique` ON `taxonomies` (`slug`);--> statement-breakpoint
CREATE TABLE `terms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`taxonomy_id` integer NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`parent_id` integer,
	FOREIGN KEY (`taxonomy_id`) REFERENCES `taxonomies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `terms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `terms_taxonomy_slug_idx` ON `terms` (`taxonomy_id`,`slug`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);