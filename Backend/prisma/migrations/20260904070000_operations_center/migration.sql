CREATE TABLE `media_assets` (
  `id` VARCHAR(36) NOT NULL,
  `original_name` VARCHAR(255) NOT NULL,
  `storage_key` VARCHAR(500) NOT NULL,
  `url` VARCHAR(1000) NOT NULL,
  `mime_type` VARCHAR(100) NOT NULL,
  `size` INTEGER NOT NULL,
  `uploader_id` BIGINT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `media_assets_storage_key_key`(`storage_key`),
  INDEX `media_assets_uploader_id_created_at_idx`(`uploader_id`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `operation_slots` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `placement` ENUM('HOME_BANNER', 'HOME_RECOMMEND', 'STARTUP_POPUP') NOT NULL,
  `title` VARCHAR(100) NOT NULL,
  `image_url` VARCHAR(1000) NOT NULL,
  `target_type` ENUM('NONE', 'DRAMA', 'INTERNAL', 'EXTERNAL') NOT NULL DEFAULT 'NONE',
  `target_value` VARCHAR(1000) NULL,
  `sort` INTEGER NOT NULL DEFAULT 0,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `start_at` DATETIME(3) NULL,
  `end_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `operation_slots_placement_enabled_sort_idx`(`placement`, `enabled`, `sort`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `announcements` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(150) NOT NULL,
  `content` TEXT NOT NULL,
  `status` ENUM('DRAFT', 'PUBLISHED', 'OFFLINE') NOT NULL DEFAULT 'DRAFT',
  `start_at` DATETIME(3) NULL,
  `end_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `announcements_status_start_at_end_at_idx`(`status`, `start_at`, `end_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `app_documents` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(50) NOT NULL,
  `title` VARCHAR(150) NOT NULL,
  `version` VARCHAR(30) NOT NULL,
  `content` LONGTEXT NOT NULL,
  `status` ENUM('DRAFT', 'PUBLISHED', 'OFFLINE') NOT NULL DEFAULT 'DRAFT',
  `published_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `app_documents_code_version_key`(`code`, `version`),
  INDEX `app_documents_code_status_published_at_idx`(`code`, `status`, `published_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `app_versions` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `platform` ENUM('ANDROID', 'IOS') NOT NULL,
  `version_name` VARCHAR(30) NOT NULL,
  `version_code` INTEGER NOT NULL,
  `min_version_code` INTEGER NOT NULL,
  `download_url` VARCHAR(1000) NOT NULL,
  `release_notes` TEXT NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `rollout_percent` INTEGER NOT NULL DEFAULT 100,
  `published_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `app_versions_platform_version_code_key`(`platform`, `version_code`),
  INDEX `app_versions_platform_enabled_published_at_idx`(`platform`, `enabled`, `published_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
