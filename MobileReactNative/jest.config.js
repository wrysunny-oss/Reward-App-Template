module.exports = {
  preset: 'react-native',
  // React Navigation 7 与 Tamagui 发布 ESM 源码，测试时必须交给 Babel 转译。
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|react-native-.+|@react-native(-community)?|@react-navigation|@tamagui|tamagui)/)',
  ],
  setupFiles: ['<rootDir>/jest.setup.js'],
};
