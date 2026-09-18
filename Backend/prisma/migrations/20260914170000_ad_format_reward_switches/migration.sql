ALTER TABLE `ad_reward_config`
  ADD COLUMN `splash_reward_enabled` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `feed_reward_enabled` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `full_screen_reward_enabled` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `rewarded_video_reward_enabled` BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE `ad_reward_settlements`
  ADD COLUMN `format` VARCHAR(20) NOT NULL DEFAULT 'REWARD';

CREATE INDEX `ad_reward_settlements_format_created_at_idx`
  ON `ad_reward_settlements`(`format`, `created_at`);
