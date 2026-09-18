ALTER TABLE `users`
  ADD COLUMN `agent_share_rate_bps` INTEGER NULL AFTER `ad_share_rate_bps`;

CREATE TABLE `agent_ad_commissions` (
  `id` VARCHAR(36) NOT NULL,
  `settlement_id` VARCHAR(36) NOT NULL,
  `agent_id` BIGINT NOT NULL,
  `source_user_id` BIGINT NOT NULL,
  `depth` INTEGER NOT NULL,
  `share_rate_bps` INTEGER NOT NULL,
  `awarded_coins` BIGINT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `agent_ad_commissions_settlement_id_agent_id_key` (`settlement_id`, `agent_id`),
  INDEX `agent_ad_commissions_agent_id_created_at_idx` (`agent_id`, `created_at`),
  INDEX `agent_ad_commissions_source_user_id_created_at_idx` (`source_user_id`, `created_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `agent_ad_commissions_settlement_id_fkey` FOREIGN KEY (`settlement_id`) REFERENCES `ad_reward_settlements` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `agent_ad_commissions_agent_id_fkey` FOREIGN KEY (`agent_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `agent_ad_commissions_source_user_id_fkey` FOREIGN KEY (`source_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
