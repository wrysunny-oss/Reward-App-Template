-- 区分手动和定时对账；schedule_key 的唯一约束保证多实例部署时每天只执行一次。
ALTER TABLE `reconciliation_runs`
  ADD COLUMN `source` VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN `schedule_key` VARCHAR(50) NULL;

CREATE UNIQUE INDEX `reconciliation_runs_schedule_key_key`
  ON `reconciliation_runs`(`schedule_key`);
