ALTER TABLE `device_risk_assessments`
  ADD COLUMN `location_cluster_safe` BOOLEAN NULL,
  ADD COLUMN `nearby_device_count` INTEGER NULL,
  ADD COLUMN `nearby_radius_meters` INTEGER NULL,
  ADD COLUMN `presence_window_minutes` INTEGER NULL,
  ADD COLUMN `location_accuracy_meters` DOUBLE NULL,
  ADD COLUMN `location_mock` BOOLEAN NULL;

CREATE TABLE `device_location_presences` (
  `id` VARCHAR(36) NOT NULL,
  `user_id` BIGINT NOT NULL,
  `device_id` VARCHAR(100) NOT NULL,
  `latitude` DOUBLE NOT NULL,
  `longitude` DOUBLE NOT NULL,
  `accuracy_meters` DOUBLE NOT NULL,
  `last_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `device_location_presences_device_id_key` (`device_id`),
  INDEX `device_location_presences_last_seen_at_idx` (`last_seen_at`),
  INDEX `device_location_presences_latitude_longitude_idx` (`latitude`, `longitude`),
  CONSTRAINT `device_location_presences_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
