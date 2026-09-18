import {appApi} from '../api/app';
import type {AdClientEvent} from '../types/api';
import type {EcpmInfo} from 'react-native-playnest-unionad';

/** 广告埋点为尽力上报，网络错误绝不能影响广告或内容播放。 */
export function reportAdEvent(event: AdClientEvent) {
  appApi.adEvent(event).catch(() => undefined);
}

/**
 * 明文 eCPM 只用于运营统计；非激励广告发币必须同时提交 SDK 的 rs_info，
 * 并由后端使用 rss-key 验真。激励视频继续只认服务端回调。
 */
export function reportAdEcpm(
  format: AdClientEvent['format'],
  placementId: string,
  value: EcpmInfo | null,
) {
  if (!value) return;
  const ecpm = typeof value.ecpm === 'string' && /^\d{1,10}(?:\.\d{1,6})?$/.test(value.ecpm)
    ? value.ecpm
    : undefined;
  reportAdEvent({
    format,
    eventType: 'ECPM',
    placementId,
    ecpm,
    requestId: value.requestID,
    creativeId: value.creativeID,
    adnName: value.adnName,
  });
  if (
    format === 'REWARD' || format === 'CONTENT_UNLOCK' || !ecpm || !value.slotID ||
    !value.requestID || typeof value.rsInfo !== 'string' || !value.rsInfo
  ) return;
  appApi.verifiedAdImpression({
    format,
    placementId,
    slotId: value.slotID,
    requestId: value.requestID,
    ecpm,
    rsInfo: value.rsInfo,
    adnName: value.adnName,
  }).catch(() => undefined);
}
