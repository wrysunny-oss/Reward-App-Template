import productConfig from '../../product.generated.json';

/** GroMore 聚合广告位。客户端请求使用广告位 ID，不使用瀑布流中的代码位 ID。 */
export const adConfig = {
  appId: productConfig.advertising.gromore.appId,
  /** 必须与穿山甲后台登记的应用名称一致，不跟随 APP 展示名称变化。 */
  sdkAppName: productConfig.brand.sdkAppName,
  splash: {
    placementId: productConfig.advertising.gromore.splashPlacementId,
    timeoutMs: 3000,
    safetyTimeoutMs: 5000,
  },
  feed: {
    placementId: productConfig.advertising.gromore.feedPlacementId,
    insertEvery: 8,
  },
  fullScreen: {
    placementId: productConfig.advertising.gromore.fullScreenPlacementId,
    playbackThreshold: 5,
    minimumIntervalMs: 20 * 60 * 1000,
    loadTimeoutMs: 8000,
    showTimeoutMs: 2 * 60 * 1000,
  },
  reward: {
    placementId: productConfig.advertising.gromore.rewardPlacementId,
  },
} as const;
