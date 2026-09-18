ALTER TABLE `ad_reward_config`
  ADD COLUMN `drama_unlock_reward_enabled` BOOLEAN NOT NULL DEFAULT true AFTER `rewarded_video_reward_enabled`;
