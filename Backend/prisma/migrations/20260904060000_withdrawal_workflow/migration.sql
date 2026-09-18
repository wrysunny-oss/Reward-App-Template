-- AlterTable: 可用金币与冻结金币分离。
ALTER TABLE `users` ADD COLUMN `frozen_coin_balance` BIGINT NOT NULL DEFAULT 0;

-- CreateTable: 单行提现规则配置。
CREATE TABLE `withdrawal_config` (
  `id` INTEGER NOT NULL DEFAULT 1,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `coins_per_cent` INTEGER NOT NULL DEFAULT 100,
  `min_coins` BIGINT NOT NULL DEFAULT 10000,
  `max_coins` BIGINT NOT NULL DEFAULT 1000000,
  `daily_count_limit` INTEGER NOT NULL DEFAULT 3,
  `daily_coin_limit` BIGINT NOT NULL DEFAULT 2000000,
  `fee_rate_bps` INTEGER NOT NULL DEFAULT 0,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: 提现状态只能由服务端状态机推进。
CREATE TABLE `withdrawals` (
  `id` VARCHAR(36) NOT NULL,
  `request_id` VARCHAR(64) NOT NULL,
  `user_id` BIGINT NOT NULL,
  `coins` BIGINT NOT NULL,
  `amount_cents` INTEGER NOT NULL,
  `fee_cents` INTEGER NOT NULL,
  `actual_cents` INTEGER NOT NULL,
  `channel` ENUM('ALIPAY', 'WECHAT', 'BANK') NOT NULL,
  `account_cipher` TEXT NOT NULL,
  `account_masked` VARCHAR(100) NOT NULL,
  `real_name_cipher` TEXT NOT NULL,
  `status` ENUM('PENDING', 'PAYING', 'COMPLETED', 'REJECTED', 'FAILED') NOT NULL DEFAULT 'PENDING',
  `review_remark` VARCHAR(500) NULL,
  `payment_reference` VARCHAR(100) NULL,
  `reviewed_by` BIGINT NULL,
  `reviewed_at` DATETIME(3) NULL,
  `completed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `withdrawals_request_id_key`(`request_id`),
  INDEX `withdrawals_status_created_at_idx`(`status`, `created_at`),
  INDEX `withdrawals_user_id_created_at_idx`(`user_id`, `created_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `withdrawals_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
