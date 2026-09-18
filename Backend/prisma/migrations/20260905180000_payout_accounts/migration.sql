CREATE TABLE `payout_accounts` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `channel` ENUM('ALIPAY', 'WECHAT', 'BANK') NOT NULL,
  `account_cipher` TEXT NOT NULL,
  `account_masked` VARCHAR(100) NOT NULL,
  `real_name_cipher` TEXT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `payout_accounts_user_id_key`(`user_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `payout_accounts_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
