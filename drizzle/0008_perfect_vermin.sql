CREATE TABLE `folders` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`icon` text DEFAULT 'folder' NOT NULL,
	`color` text DEFAULT '#6b7280' NOT NULL,
	`position` text NOT NULL,
	`collapsed` integer DEFAULT false NOT NULL,
	`system` integer DEFAULT false NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
ALTER TABLE `chats` ADD `folder_id` text REFERENCES folders(id);--> statement-breakpoint
ALTER TABLE `chats` ADD `folder_position` text DEFAULT 'a0' NOT NULL;--> statement-breakpoint
ALTER TABLE `sub_chats` ADD `position` text DEFAULT 'a0' NOT NULL;