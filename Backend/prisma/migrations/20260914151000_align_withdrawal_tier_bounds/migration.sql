UPDATE `withdrawal_config`
SET `min_coins` = 10000,
    `max_coins` = 1000000
WHERE `tiers` = JSON_ARRAY('10000', '50000', '100000', '500000', '1000000');
