ALTER TABLE `ad_reward_config`
  ADD COLUMN `rewarded_ad_milestones` JSON NULL AFTER `daily_rewarded_ad_limit`,
  ADD COLUMN `invite_milestones` JSON NULL AFTER `rewarded_ad_milestones`;

ALTER TABLE `ad_reward_settlements`
  ADD COLUMN `milestone_bonus_coins` BIGINT NOT NULL DEFAULT 0 AFTER `awarded_coins`;
