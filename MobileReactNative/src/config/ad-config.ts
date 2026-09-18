import productConfig from '../../product.generated.json';

export type AdvertisingProviderName = 'none' | 'gromore' | 'taku';
type ProviderPlacementConfig = {
  registeredAppName: string;
  appId: string;
  splashPlacementId: string;
  feedPlacementId: string;
  fullScreenPlacementId: string;
  rewardPlacementId: string;
};

const provider = productConfig.advertising.provider as AdvertisingProviderName;
const providers = productConfig.advertising.providers as Partial<Record<AdvertisingProviderName, ProviderPlacementConfig>>;
const selected = providers[provider];

if (provider !== 'none' && !selected) {
  throw new Error(`广告平台 ${provider} 缺少客户端配置`);
}

/** 平台无关广告配置；业务代码不得直接读取某个厂商节点。 */
export const adConfig = {
  provider,
  appId: selected?.appId ?? '',
  /** 必须与广告平台后台登记的应用名称一致，不跟随 APP 展示名称变化。 */
  sdkAppName: selected?.registeredAppName ?? '',
  splash: {
    placementId: selected?.splashPlacementId ?? '',
    timeoutMs: 3000,
    safetyTimeoutMs: 5000,
  },
  feed: {
    placementId: selected?.feedPlacementId ?? '',
    insertEvery: 8,
  },
  fullScreen: {
    placementId: selected?.fullScreenPlacementId ?? '',
    playbackThreshold: 5,
    minimumIntervalMs: 20 * 60 * 1000,
    loadTimeoutMs: 8000,
    showTimeoutMs: 2 * 60 * 1000,
  },
  reward: {
    placementId: selected?.rewardPlacementId ?? '',
  },
} as const;
