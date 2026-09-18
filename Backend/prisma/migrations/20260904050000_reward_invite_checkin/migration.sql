-- AlterTable: 为用户增加个人邀请码。
ALTER TABLE `users` ADD COLUMN `invite_code` VARCHAR(12) NULL;
CREATE UNIQUE INDEX `users_invite_code_key` ON `users`(`invite_code`);

-- AlterEnum: 金币流水增加邀请奖励类型。
ALTER TABLE `reward_ledgers`
  MODIFY `type` ENUM('SIGNIN', 'INVITE', 'TASK', 'AD', 'SHARE', 'WITHDRAW', 'ADJUSTMENT') NOT NULL;

-- CreateTable: 不可变的用户邀请关系。
CREATE TABLE `invite_relations` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `inviter_id` BIGINT NOT NULL,
  `invitee_id` BIGINT NOT NULL,
  `invite_code` VARCHAR(12) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `invite_relations_invitee_id_key`(`invitee_id`),
  INDEX `invite_relations_inviter_id_created_at_idx`(`inviter_id`, `created_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `invite_relations_inviter_id_fkey` FOREIGN KEY (`inviter_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `invite_relations_invitee_id_fkey` FOREIGN KEY (`invitee_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: 后台可配置的奖励规则。
CREATE TABLE `reward_rules` (
  `code` VARCHAR(50) NOT NULL,
  `name` VARCHAR(80) NOT NULL,
  `amount` BIGINT NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `description` VARCHAR(255) NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: 用户每日签到记录。
CREATE TABLE `check_ins` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `date` DATE NOT NULL,
  `streak` INTEGER NOT NULL,
  `reward` BIGINT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `check_ins_user_id_date_key`(`user_id`, `date`),
  INDEX `check_ins_date_created_at_idx`(`date`, `created_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `check_ins_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
