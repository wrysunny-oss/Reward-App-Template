import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {normalizeAndValidateProductConfig} from './product-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = {
  schemaVersion: 2,
  productCode: 'matrix-app',
  brand: {
    appDisplayName: '矩阵测试应用', adminTitle: '矩阵测试后台',
    adminDescription: '矩阵测试后台', companyName: '示例公司',
  },
  android: {applicationId: 'com.example.matrix'},
  admin: {namespace: 'matrix-app-admin'},
  modules: {
    advertising: true, rewards: true, invitations: true,
    smsRegistration: true, withdrawals: true, alipayPayout: true,
  },
  content: {type: 'shortDrama', providers: {shortDrama: {sdkSettingId: '100001'}}},
  domains: {productionApiOrigin: 'https://api.example.com'},
  advertising: {
    provider: 'gromore',
    providers: {
      gromore: {
        registeredAppName: '矩阵测试应用', appId: '100001',
        splashPlacementId: '100002', feedPlacementId: '100003',
        fullScreenPlacementId: '100004', rewardPlacementId: '100005',
      },
    },
  },
};

test('模块矩阵接受 shortDrama + gromore', () => {
  const result = normalizeAndValidateProductConfig(base);
  assert.equal(result.content.type, 'shortDrama');
  assert.equal(result.advertising.provider, 'gromore');
});

test('模块矩阵接受 none + none', () => {
  const config = structuredClone(base);
  config.content.type = 'none';
  config.modules.advertising = false;
  config.advertising = {provider: 'none', providers: {}};
  const result = normalizeAndValidateProductConfig(config);
  assert.equal(result.content.type, 'none');
  assert.equal(result.advertising.provider, 'none');
});

test('模块矩阵接受 quiz + taku', () => {
  const config = structuredClone(base);
  config.content.type = 'quiz';
  config.advertising.provider = 'taku';
  config.advertising.providers.taku = {
    registeredAppName: '矩阵测试应用', appId: '200001',
    splashPlacementId: '200002', feedPlacementId: '200003',
    fullScreenPlacementId: '200004', rewardPlacementId: '200005',
  };
  const result = normalizeAndValidateProductConfig(config);
  assert.equal(result.content.type, 'quiz');
  assert.equal(result.advertising.provider, 'taku');
});

test('三端保留内容与广告模块硬边界', () => {
  const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
  assert.match(read('Backend/src/app.ts'), /getContentRoutes\(contentType\)/);
  assert.match(read('Backend/src/modules/admin/admin.routes.ts'), /contentType === "shortDrama"/);
  assert.match(read('Admin/apps/web-naive/src/router/routes/modules/operations.ts'), /contentType === 'shortDrama'/);
  assert.match(read('MobileReactNative/src/navigation/RootNavigator.tsx'), /isShortDramaEnabled/);
  assert.match(read('MobileReactNative/android/app/build.gradle'), /if \(!shortDramaEnabled\)/);
  assert.match(read('MobileReactNative/android/app/build.gradle'), /if \(groMoreEnabled\)/);
  assert.match(read('MobileReactNative/react-native.config.js'), /android: null/);
});

test('模板不包含实际环境文件或仓库内调试签名', () => {
  for (const relative of [
    'Admin/apps/web-naive/.env',
    'Admin/apps/web-naive/.env.analyze',
    'Admin/apps/web-naive/.env.development',
    'Admin/apps/web-naive/.env.production',
    'MobileReactNative/android/app/debug.keystore',
  ]) {
    assert.equal(fs.existsSync(path.join(root, relative)), false, `${relative} 不应存在`);
  }
});
