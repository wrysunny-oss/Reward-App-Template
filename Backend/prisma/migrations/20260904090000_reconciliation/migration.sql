CREATE TABLE `reconciliation_runs` (
  `id` VARCHAR(36) NOT NULL, `status` ENUM('RUNNING','PASSED','FAILED') NOT NULL DEFAULT 'RUNNING',
  `checked_users` INTEGER NOT NULL DEFAULT 0, `issue_count` INTEGER NOT NULL DEFAULT 0,
  `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `completed_at` DATETIME(3) NULL, `error_message` TEXT NULL,
  INDEX `reconciliation_runs_started_at_idx`(`started_at`), PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `reconciliation_issues` (
  `id` BIGINT NOT NULL AUTO_INCREMENT, `run_id` VARCHAR(36) NOT NULL, `user_id` BIGINT NOT NULL, `type` VARCHAR(50) NOT NULL,
  `actual_amount` BIGINT NOT NULL, `expected_amount` BIGINT NOT NULL, `difference` BIGINT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX `reconciliation_issues_user_id_created_at_idx`(`user_id`,`created_at`),
  PRIMARY KEY (`id`), CONSTRAINT `reconciliation_issues_run_id_fkey` FOREIGN KEY (`run_id`) REFERENCES `reconciliation_runs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
