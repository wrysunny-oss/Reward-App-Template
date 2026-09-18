/** 后端枚举到中文展示文案的统一映射；未知值保留原值，便于发现新状态。 */
const labels: Record<string, string> = {
  ACTIVE: '正常', BANNED: '已封禁', CLOSED: '已关闭', COMPLETED: '已完成',
  CONFIRMED: '已确认', CRITICAL: '严重', DISABLED: '已禁用', DRAFT: '草稿',
  EXPORTED: '已导出', FAILED: '失败', FROZEN: '已冻结', HIGH: '高风险',
  IGNORED: '已忽略', INVALID: '无效', LOW: '低风险', MEDIUM: '中风险',
  NORMAL: '正常', OFFLINE: '已下线', PARTIAL: '部分成功', PASSED: '已通过',
  PAYING: '打款中', PENDING: '待处理', PROCESSING: '处理中', PUBLISHED: '已发布',
  REJECTED: '已拒绝', REWARD_RESTRICTED: '限制奖励', RUNNING: '执行中',
  SUCCESS: '成功', VALID: '有效', WATCH: '观察中', WITHDRAWAL_RESTRICTED: '限制提现',
};

export const businessStatusText = (status?: null | string) => status ? (labels[status] ?? status) : '-';

export const businessStatusType = (status?: null | string): 'error' | 'info' | 'success' | 'warning' => {
  if (['ACTIVE', 'COMPLETED', 'CONFIRMED', 'PASSED', 'PUBLISHED', 'SUCCESS', 'VALID'].includes(status ?? '')) return 'success';
  if (['BANNED', 'CRITICAL', 'DISABLED', 'FAILED', 'FROZEN', 'HIGH', 'INVALID', 'PARTIAL', 'REJECTED'].includes(status ?? '')) return 'error';
  if (['DRAFT', 'EXPORTED', 'MEDIUM', 'PAYING', 'PENDING', 'PROCESSING', 'RUNNING', 'WATCH'].includes(status ?? '')) return 'warning';
  return 'info';
};
