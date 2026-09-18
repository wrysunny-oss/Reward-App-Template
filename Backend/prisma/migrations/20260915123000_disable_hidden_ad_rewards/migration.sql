ALTER TABLE `ad_reward_config`
  ALTER COLUMN `splash_reward_enabled` SET DEFAULT FALSE,
  ALTER COLUMN `feed_reward_enabled` SET DEFAULT FALSE,
  ALTER COLUMN `full_screen_reward_enabled` SET DEFAULT FALSE;

UPDATE `ad_reward_config`
SET `splash_reward_enabled` = FALSE,
    `feed_reward_enabled` = FALSE,
    `full_screen_reward_enabled` = FALSE
WHERE `id` = 1;
