UPDATE `operation_slots`
SET `target_type` = 'CONTENT'
WHERE `target_type` = 'DRAMA';

ALTER TABLE `operation_slots`
  MODIFY `target_type` ENUM('NONE', 'CONTENT', 'INTERNAL', 'EXTERNAL') NOT NULL DEFAULT 'NONE';
