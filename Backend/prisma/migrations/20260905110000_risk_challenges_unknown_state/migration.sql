ALTER TABLE `device_risk_assessments`
  ADD COLUMN `known_checks` INTEGER NOT NULL DEFAULT 10,
  MODIFY `sim_present` BOOLEAN NULL,
  MODIFY `wechat_installed` BOOLEAN NULL,
  MODIFY `douyin_installed` BOOLEAN NULL,
  MODIFY `alipay_installed` BOOLEAN NULL,
  MODIFY `emulator_detected` BOOLEAN NULL,
  MODIFY `cloud_device_detected` BOOLEAN NULL,
  MODIFY `script_detected` BOOLEAN NULL,
  MODIFY `network_trusted` BOOLEAN NULL,
  MODIFY `ip_trusted` BOOLEAN NULL,
  MODIFY `location_distance_safe` BOOLEAN NULL;

CREATE TABLE `device_risk_challenges` (
  `id` VARCHAR(36) NOT NULL,
  `user_id` BIGINT NOT NULL,
  `context` VARCHAR(20) NOT NULL,
  `nonce` VARCHAR(64) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `used_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `device_risk_challenges_nonce_key` (`nonce`),
  INDEX `device_risk_challenges_user_id_expires_at_idx` (`user_id`, `expires_at`),
  CONSTRAINT `device_risk_challenges_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
