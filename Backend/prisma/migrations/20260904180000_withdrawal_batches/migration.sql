CREATE TABLE `withdrawal_batches` (
  `id` VARCHAR(36) NOT NULL,
  `batch_no` VARCHAR(40) NOT NULL,
  `request_id` VARCHAR(64) NOT NULL,
  `result_request_id` VARCHAR(64) NULL,
  `status` ENUM('DRAFT','EXPORTED','PROCESSING','PARTIAL','COMPLETED','CLOSED') NOT NULL DEFAULT 'DRAFT',
  `order_count` INTEGER NOT NULL,
  `total_cents` INTEGER NOT NULL,
  `created_by` BIGINT NOT NULL,
  `remark` VARCHAR(500) NULL,
  `exported_at` DATETIME(3) NULL,
  `completed_at` DATETIME(3) NULL,
  `closed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `withdrawal_batches_batch_no_key`(`batch_no`),
  UNIQUE INDEX `withdrawal_batches_request_id_key`(`request_id`),
  UNIQUE INDEX `withdrawal_batches_result_request_id_key`(`result_request_id`),
  INDEX `withdrawal_batches_status_created_at_idx`(`status`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `withdrawal_batch_items` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `batch_id` VARCHAR(36) NOT NULL,
  `withdrawal_id` VARCHAR(36) NOT NULL,
  `status` ENUM('PENDING','SUCCESS','FAILED') NOT NULL DEFAULT 'PENDING',
  `payment_reference` VARCHAR(100) NULL,
  `failure_reason` VARCHAR(500) NULL,
  `processed_at` DATETIME(3) NULL,
  UNIQUE INDEX `withdrawal_batch_items_withdrawal_id_key`(`withdrawal_id`),
  INDEX `withdrawal_batch_items_batch_id_status_idx`(`batch_id`, `status`),
  PRIMARY KEY (`id`),
  CONSTRAINT `withdrawal_batch_items_batch_id_fkey` FOREIGN KEY (`batch_id`) REFERENCES `withdrawal_batches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `withdrawal_batch_items_withdrawal_id_fkey` FOREIGN KEY (`withdrawal_id`) REFERENCES `withdrawals`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
