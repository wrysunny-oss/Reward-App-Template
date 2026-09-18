CREATE TABLE `ad_callback_logs` (
  `id` VARCHAR(36) NOT NULL,
  `event_id` VARCHAR(100) NOT NULL,
  `status` VARCHAR(20) NOT NULL,
  `reason` VARCHAR(500) NULL,
  `payload` JSON NOT NULL,
  `ip` VARCHAR(64) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `ad_callback_logs_event_id_key` (`event_id`),
  INDEX `ad_callback_logs_status_created_at_idx` (`status`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
