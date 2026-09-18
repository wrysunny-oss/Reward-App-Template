ALTER TABLE `ad_reward_config`
  ADD COLUMN `direct_share_rate_bps` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `indirect_share_rate_bps` INTEGER NOT NULL DEFAULT 0;

ALTER TABLE `ad_reward_settlements`
  ADD COLUMN `direct_inviter_id` BIGINT NULL,
  ADD COLUMN `indirect_inviter_id` BIGINT NULL,
  ADD COLUMN `direct_share_rate_bps` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `indirect_share_rate_bps` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `direct_awarded_coins` BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN `indirect_awarded_coins` BIGINT NOT NULL DEFAULT 0;
