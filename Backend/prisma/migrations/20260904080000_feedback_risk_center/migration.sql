ALTER TABLE `users`
  ADD COLUMN `risk_status` ENUM('NORMAL','WATCH','REWARD_RESTRICTED','WITHDRAWAL_RESTRICTED','FROZEN','BANNED') NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN `risk_remark` VARCHAR(500) NULL;
ALTER TABLE `feedback`
  ADD COLUMN `handler_id` BIGINT NULL,
  ADD COLUMN `internal_note` TEXT NULL,
  ADD COLUMN `resolved_at` DATETIME(3) NULL;

CREATE TABLE `reports` (
  `id` BIGINT NOT NULL AUTO_INCREMENT, `user_id` BIGINT NOT NULL, `type` VARCHAR(30) NOT NULL,
  `target_type` VARCHAR(30) NOT NULL, `target_id` VARCHAR(100) NULL, `content` TEXT NOT NULL,
  `evidence_urls` JSON NULL, `status` ENUM('PENDING','PROCESSING','VALID','INVALID','CLOSED') NOT NULL DEFAULT 'PENDING',
  `handler_id` BIGINT NULL, `disposition` VARCHAR(100) NULL, `remark` TEXT NULL, `resolved_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL,
  INDEX `reports_status_created_at_idx`(`status`,`created_at`), INDEX `reports_user_id_created_at_idx`(`user_id`,`created_at`),
  PRIMARY KEY (`id`), CONSTRAINT `reports_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `login_logs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT, `user_id` BIGINT NULL, `account` VARCHAR(50) NOT NULL, `success` BOOLEAN NOT NULL,
  `failure_code` VARCHAR(50) NULL, `ip` VARCHAR(64) NULL, `user_agent` VARCHAR(500) NULL, `device_id` VARCHAR(100) NULL,
  `app_version` VARCHAR(30) NULL, `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `login_logs_user_id_created_at_idx`(`user_id`,`created_at`), INDEX `login_logs_ip_created_at_idx`(`ip`,`created_at`),
  INDEX `login_logs_device_id_created_at_idx`(`device_id`,`created_at`), PRIMARY KEY (`id`),
  CONSTRAINT `login_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `user_devices` (
  `id` BIGINT NOT NULL AUTO_INCREMENT, `user_id` BIGINT NOT NULL, `device_id` VARCHAR(100) NOT NULL, `platform` VARCHAR(30) NULL,
  `app_version` VARCHAR(30) NULL, `first_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `last_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `user_devices_user_id_device_id_key`(`user_id`,`device_id`), INDEX `user_devices_device_id_last_seen_at_idx`(`device_id`,`last_seen_at`),
  PRIMARY KEY (`id`), CONSTRAINT `user_devices_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `risk_events` (
  `id` BIGINT NOT NULL AUTO_INCREMENT, `user_id` BIGINT NULL, `rule_code` VARCHAR(80) NOT NULL,
  `level` ENUM('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL, `title` VARCHAR(150) NOT NULL, `detail` JSON NULL,
  `status` ENUM('PENDING','CONFIRMED','IGNORED') NOT NULL DEFAULT 'PENDING', `handler_id` BIGINT NULL,
  `remark` VARCHAR(500) NULL, `handled_at` DATETIME(3) NULL, `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `risk_events_status_level_created_at_idx`(`status`,`level`,`created_at`), INDEX `risk_events_user_id_created_at_idx`(`user_id`,`created_at`),
  PRIMARY KEY (`id`), CONSTRAINT `risk_events_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
