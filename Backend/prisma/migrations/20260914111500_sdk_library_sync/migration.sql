CREATE TABLE `sdk_library_syncs` (
  `request_id` VARCHAR(64) NOT NULL,
  `user_id` BIGINT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `sdk_library_syncs_user_id_created_at_idx`(`user_id`, `created_at`),
  PRIMARY KEY (`request_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `sdk_library_syncs`
  ADD CONSTRAINT `sdk_library_syncs_user_id_fkey`
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
