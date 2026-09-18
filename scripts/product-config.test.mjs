import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyModuleOverrides,
  normalizeAndValidateProductConfig,
} from './product-config.mjs';

const validConfig = {
  schemaVersion: 1,
  productCode: 'demo-theater',
  brand: {
    appDisplayName: '示例剧场',
    adminTitle: '示例剧场管理后台',
    adminDescription: '示例剧场运营管理后台',
    companyName: '示例科技',
    sdkAppName: '示例应用',
  },
  android: { applicationId: 'com.example.theater' },
  admin: { namespace: 'demo-theater-admin' },
  modules: {
    shortDrama: true,
    advertising: true,
    rewards: true,
    invitations: true,
    smsRegistration: true,
    withdrawals: true,
    alipayPayout: true,
  },
  domains: { productionApiOrigin: 'https://api.example.com/' },
  advertising: {
    gromore: {
      appId: '1',
      splashPlacementId: '2',
      feedPlacementId: '3',
      fullScreenPlacementId: '4',
      rewardPlacementId: '5',
    },
  },
};

test('产品配置校验并规范化 API 地址', () => {
  const product = normalizeAndValidateProductConfig(validConfig);
  assert.equal(product.domains.productionApiOrigin, 'https://api.example.com');
  assert.equal(product.brand.appDisplayName, '示例剧场');
});

test('模块覆盖不修改原对象', () => {
  const result = applyModuleOverrides(validConfig, [['invitations', false]]);
  assert.equal(result.modules.invitations, false);
  assert.equal(validConfig.modules.invitations, true);
});

test('支付宝自动打款不能脱离提现模块启用', () => {
  const config = applyModuleOverrides(validConfig, [['withdrawals', false]]);
  assert.throws(() => normalizeAndValidateProductConfig(config), /alipayPayout/);
});

test('广告平台 ID 必须是纯数字字符串', () => {
  const config = structuredClone(validConfig);
  config.advertising.gromore.appId = 'app-secret';
  assert.throws(() => normalizeAndValidateProductConfig(config), /纯数字字符串/);
});
