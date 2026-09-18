CREATE TABLE `golden_watch_progress` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `date` DATE NOT NULL,
  `watched_seconds` INTEGER NOT NULL DEFAULT 0,
  `session_id` VARCHAR(64) NULL,
  `session_seconds` INTEGER NOT NULL DEFAULT 0,
  `last_heartbeat_at` DATETIME(3) NULL,
  `completed_at` DATETIME(3) NULL,
  `reward` BIGINT NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `golden_watch_progress_user_id_date_key`(`user_id`, `date`),
  INDEX `golden_watch_progress_date_completed_at_idx`(`date`, `completed_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `golden_watch_progress`
  ADD CONSTRAINT `golden_watch_progress_user_id_fkey`
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO `reward_rules` (`code`, `name`, `amount`, `enabled`, `description`, `updated_at`)
VALUES ('GOLDEN_WATCH', '黄金时段观剧', 15, TRUE, '在配置时段内累计有效观看达到要求后，每日发放一次', CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `description` = VALUES(`description`);

INSERT INTO `system_configs` (`key`, `value`, `description`, `updated_at`)
VALUES (
  'reward.golden_watch',
  JSON_OBJECT(
    'enabled', TRUE,
    'requiredSeconds', 300,
    'heartbeatSeconds', 15,
    'periods', JSON_ARRAY(
      JSON_OBJECT('start', '12:00', 'end', '14:00'),
      JSON_OBJECT('start', '18:00', 'end', '22:00')
    )
  ),
  '黄金时段观剧任务配置，按北京时间生效',
  CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);
