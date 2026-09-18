/**
 * 将后端 ISO 时间统一显示为中国标准时间。
 * 空值或无效值返回短横线，避免表格出现 Invalid Date。
 */
export function formatDateTime(value?: Date | null | number | string) {
  if (value === null || value === undefined || value === '') return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const parts = new Intl.DateTimeFormat('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}:${part('second')}`;
}

/** 日期字段只保留中国时区的年月日。 */
export function formatDate(value?: Date | null | number | string) {
  return formatDateTime(value).split(' ')[0] ?? '-';
}
