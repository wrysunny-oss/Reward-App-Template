ALTER TABLE `users`
  ADD COLUMN `ad_share_rate_bps` INTEGER NULL;

CREATE TABLE `ad_reward_config` (
  `id` INTEGER NOT NULL DEFAULT 1,
  `default_share_rate_bps` INTEGER NOT NULL DEFAULT 5000,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ad_reward_settlements` (
  `id` VARCHAR(36) NOT NULL,
  `request_id` VARCHAR(100) NOT NULL,
  `user_id` BIGINT NOT NULL,
  `revenue_micros` BIGINT NOT NULL,
  `share_rate_bps` INTEGER NOT NULL,
  `coins_per_cent` INTEGER NOT NULL,
  `awarded_coins` BIGINT NOT NULL,
  `source` VARCHAR(30) NOT NULL DEFAULT 'PANGLE',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `ad_reward_settlements_request_id_key` (`request_id`),
  INDEX `ad_reward_settlements_user_id_created_at_idx` (`user_id`, `created_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `ad_reward_settlements_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `ad_reward_config` (`id`, `default_share_rate_bps`, `updated_at`)
VALUES (1, 5000, CURRENT_TIMESTAMP(3));
