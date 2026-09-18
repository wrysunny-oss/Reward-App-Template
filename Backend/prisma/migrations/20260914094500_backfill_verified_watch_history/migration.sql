-- 将已经完成真机开播验证的旧记录补入观看历史；旧验证未保存集数，只能从第 1 集恢复。
INSERT IGNORE INTO `episodes` (`drama_id`, `episode_no`, `title`, `video_url`, `duration_sec`, `status`)
SELECT DISTINCT `drama_id`, 1, '第 1 集', '', 0, 'PUBLISHED'
FROM `drama_playback_validations`
WHERE `playback_started_at` IS NOT NULL;

INSERT IGNORE INTO `watch_histories` (`user_id`, `drama_id`, `episode_id`, `position_seconds`, `updated_at`)
SELECT validation.`user_id`, validation.`drama_id`, episode.`id`, 0, validation.`playback_started_at`
FROM `drama_playback_validations` validation
INNER JOIN `episodes` episode
  ON episode.`drama_id` = validation.`drama_id` AND episode.`episode_no` = 1
WHERE validation.`playback_started_at` IS NOT NULL;
