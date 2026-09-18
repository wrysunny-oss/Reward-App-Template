/* global jest */
// 单元测试环境没有 Android 原生存储模块，使用官方内存 Mock。
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Jest 不加载 Android TurboModule，使用最小行为 Mock 避免导入广告适配层时失败。
jest.mock('react-native-playnest-unionad', () => ({
  register: jest.fn(() => Promise.resolve(true)),
  loadRewardVideoAd: jest.fn(() => () => undefined),
  showRewardVideoAd: jest.fn(() => Promise.resolve(true)),
  UnionadOrientation: {VERTICAL: 1, HORIZONTAL: 2},
}));
