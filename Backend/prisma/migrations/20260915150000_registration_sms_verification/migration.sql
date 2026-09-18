CREATE TABLE `sms_verification_codes` (
  `id` VARCHAR(36) NOT NULL,
  `phone` VARCHAR(20) NOT NULL,
  `purpose` VARCHAR(30) NOT NULL,
  `code_hash` CHAR(64) NOT NULL,
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `expires_at` DATETIME(3) NOT NULL,
  `consumed_at` DATETIME(3) NULL,
  `provider_id` VARCHAR(100) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `sms_verification_codes_phone_purpose_created_at_idx` (`phone`, `purpose`, `created_at`),
  INDEX `sms_verification_codes_expires_at_idx` (`expires_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
