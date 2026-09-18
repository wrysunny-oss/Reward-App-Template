ALTER TABLE `ad_reward_config`
  ALTER COLUMN `splash_reward_enabled` SET DEFAULT TRUE,
  ALTER COLUMN `feed_reward_enabled` SET DEFAULT TRUE,
  ALTER COLUMN `full_screen_reward_enabled` SET DEFAULT TRUE;

UPDATE `ad_reward_config`
SET `splash_reward_enabled` = TRUE,
    `feed_reward_enabled` = TRUE,
    `full_screen_reward_enabled` = TRUE
WHERE `id` = 1;
