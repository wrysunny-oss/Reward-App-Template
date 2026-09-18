-- 历史结算仍按原“用户收益内拆分”口径对账，新结算改为平台额外支付返佣。
ALTER TABLE `ad_reward_settlements`
  ADD COLUMN `commission_funding` VARCHAR(20) NOT NULL DEFAULT 'USER_DEDUCTED' AFTER `indirect_awarded_coins`;

-- Prisma 后续创建的新记录默认使用平台支付口径。
ALTER TABLE `ad_reward_settlements`
  MODIFY COLUMN `commission_funding` VARCHAR(20) NOT NULL DEFAULT 'PLATFORM_FUNDED';
