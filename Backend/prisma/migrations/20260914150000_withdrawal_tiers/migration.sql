ALTER TABLE `withdrawal_config`
  ADD COLUMN `tiers` JSON NULL AFTER `max_coins`;

UPDATE `withdrawal_config`
SET `tiers` = JSON_ARRAY('10000', '50000', '100000', '500000', '1000000')
WHERE `tiers` IS NULL;

ALTER TABLE `withdrawal_config`
  MODIFY COLUMN `tiers` JSON NOT NULL;
