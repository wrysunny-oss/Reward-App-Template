CREATE TABLE `drama_playback_validations` (
  `id` VARCHAR(36) NOT NULL,
  `drama_id` BIGINT NOT NULL,
  `user_id` BIGINT NOT NULL,
  `device_hash` CHAR(64) NOT NULL,
  `device_model` VARCHAR(100) NULL,
  `abi` VARCHAR(50) NULL,
  `sdk_version` VARCHAR(30) NULL,
  `app_version` VARCHAR(30) NULL,
  `request_succeeded_at` DATETIME(3) NULL,
  `playback_started_at` DATETIME(3) NULL,
  `last_event_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `drama_playback_validations_drama_id_device_hash_key` (`drama_id`, `device_hash`),
  INDEX `drama_playback_validations_playback_started_at_idx` (`playback_started_at`),
  INDEX `drama_playback_validations_user_id_updated_at_idx` (`user_id`, `updated_at`),
  CONSTRAINT `drama_playback_validations_drama_id_fkey`
    FOREIGN KEY (`drama_id`) REFERENCES `dramas` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `drama_playback_validations_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
