import AsyncStorage from '@react-native-async-storage/async-storage';
import type {GoldenWatchProgressResult} from '../types/api';

const PENDING_RECEIPT_KEY = 'hly_golden_watch_receipt_v1';

export async function rememberGoldenWatchReward(result: GoldenWatchProgressResult) {
  if (Number(result.awardedCoins) <= 0 || result.coinBalance == null) return;
  await AsyncStorage.setItem(PENDING_RECEIPT_KEY, JSON.stringify({awardedCoins: result.awardedCoins, coinBalance: result.coinBalance}));
}

export async function takeGoldenWatchReward() {
  const raw = await AsyncStorage.getItem(PENDING_RECEIPT_KEY);
  if (!raw) return undefined;
  await AsyncStorage.removeItem(PENDING_RECEIPT_KEY);
  try {
    return JSON.parse(raw) as {awardedCoins: string | number; coinBalance: string | number};
  } catch {
    return undefined;
  }
}
