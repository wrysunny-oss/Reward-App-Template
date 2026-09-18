import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'hly_pending_ad_rewards_v1';
const MAX_PENDING_AGE_MS = 24 * 60 * 60 * 1000;

export interface PendingAdReward {
  key: string;
  transactionId?: string;
  userId: string;
  startedAt: number;
  format?: 'REWARD' | 'CONTENT_UNLOCK';
}

async function readAll(): Promise<PendingAdReward[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<PendingAdReward & {createdAt?: number}>;
    const cutoff = Date.now() - MAX_PENDING_AGE_MS;
    return Array.isArray(parsed)
      ? parsed.map(item => ({
        key: item.key || item.transactionId || `attempt-${item.userId}-${item.createdAt}`,
        transactionId: item.transactionId,
        userId: item.userId,
        startedAt: item.startedAt ?? item.createdAt ?? 0,
        format: item.format ?? 'REWARD',
      })).filter(item => item.key && item.userId && item.startedAt >= cutoff)
      : [];
  } catch {
    return [];
  }
}

async function writeAll(items: PendingAdReward[]) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(-10)));
}

/** 保存尚未由服务端确认的 SDK 交易号，支持回调延迟和 App 重启后的补查。 */
export async function rememberPendingAdReward(userId: string, transactionId: string | undefined, startedAt: number, format: 'REWARD' | 'CONTENT_UNLOCK' = 'REWARD') {
  const current = await readAll();
  const key = transactionId || `attempt-${userId}-${startedAt}`;
  const next = current.filter(item => item.key !== key);
  next.push({key, userId, transactionId, startedAt, format});
  await writeAll(next);
  return key;
}

export async function getPendingAdRewards(userId: string) {
  return (await readAll()).filter(item => item.userId === userId);
}

export async function forgetPendingAdReward(key: string) {
  const current = await readAll();
  await writeAll(current.filter(item => item.key !== key));
}
