CREATE TABLE `ad_client_events` (
  `id` VARCHAR(36) NOT NULL,
  `format` VARCHAR(30) NOT NULL,
  `event_type` VARCHAR(30) NOT NULL,
  `placement_id` VARCHAR(50) NOT NULL,
  `request_id` VARCHAR(100) NULL,
  `creative_id` VARCHAR(100) NULL,
  `adn_name` VARCHAR(50) NULL,
  `ecpm` DECIMAL(14, 4) NULL,
  `error_message` VARCHAR(500) NULL,
  `device_hash` CHAR(64) NULL,
  `platform` VARCHAR(30) NULL,
  `app_version` VARCHAR(30) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `ad_client_events_created_at_idx` (`created_at`),
  INDEX `ad_client_events_format_event_type_created_at_idx` (`format`, `event_type`, `created_at`),
  INDEX `ad_client_events_placement_id_created_at_idx` (`placement_id`, `created_at`),
  INDEX `ad_client_events_device_hash_created_at_idx` (`device_hash`, `created_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `system_configs` (`key`, `value`, `description`, `updated_at`)
VALUES (
  'ads.runtime_config',
  '{"enabled":true,"splash":{"enabled":true,"placementId":"104516017","timeoutMs":3000,"safetyTimeoutMs":5000},"feed":{"enabled":true,"placementId":"104517426","insertEvery":8},"fullScreen":{"enabled":true,"placementId":"104516612","playbackThreshold":5,"minimumIntervalMinutes":20,"loadTimeoutMs":8000,"showTimeoutMs":120000},"reward":{"enabled":true,"placementId":"104489019"}}',
  'App 广告位、开关与频控策略',
  CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);
