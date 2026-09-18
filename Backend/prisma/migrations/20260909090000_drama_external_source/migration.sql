-- 为第三方短剧建立稳定的本地映射，使收藏、详情和观看历史统一使用本地 Drama 主键。
ALTER TABLE `dramas`
  ADD COLUMN `provider` VARCHAR(30) NOT NULL DEFAULT 'LOCAL',
  ADD COLUMN `external_id` VARCHAR(100) NULL,
  ADD COLUMN `external_episode_count` INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX `dramas_provider_external_id_key`
  ON `dramas`(`provider`, `external_id`);
