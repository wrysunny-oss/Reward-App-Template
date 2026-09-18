import 'react-native-playnest-unionad';

declare module 'react-native-playnest-unionad' {
  interface RewardVerify {
    /** GroMore 服务端验奖交易 ID，用于日志追踪和幂等结算。 */
    transactionId?: string;
  }

  interface RewardVideoCallback {
    /** 激励视频已经完整播放；是否发奖仍以后端验奖为准。 */
    onFinish?: () => void;
  }
}
