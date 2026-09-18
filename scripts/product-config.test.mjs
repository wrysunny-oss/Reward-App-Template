import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyModuleOverrides,
  normalizeAndValidateProductConfig,
} from './product-config.mjs';

const validConfig = {
  schemaVersion: 2,
  productCode: 'demo-theater',
  brand: {
    appDisplayName: '示例剧场',
    adminTitle: '示例剧场管理后台',
    adminDescription: '示例剧场运营管理后台',
    companyName: '示例科技',
  },
  android: { applicationId: 'com.example.theater' },
  admin: { namespace: 'demo-theater-admin' },
  modules: {
    advertising: true,
    rewards: true,
    invitations: true,
    smsRegistration: true,
    withdrawals: true,
    alipayPayout: true,
  },
  content: { type: 'shortDrama', providers: { shortDrama: { sdkSettingId: '6' } } },
  domains: { productionApiOrigin: 'https://api.example.com/' },
  advertising: {
    provider: 'gromore',
    providers: {
      gromore: {
        registeredAppName: '示例应用',
        appId: '1',
        splashPlacementId: '2',
        feedPlacementId: '3',
        fullScreenPlacementId: '4',
        rewardPlacementId: '5',
      },
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
  config.advertising.providers.gromore.appId = 'app-secret';
  assert.throws(() => normalizeAndValidateProductConfig(config), /纯数字字符串/);
});

test('内容类型不再依赖短剧布尔开关', () => {
  const config = structuredClone(validConfig);
  config.content.type = 'quiz';
  assert.equal(normalizeAndValidateProductConfig(config).content.type, 'quiz');
});

test('启用广告时必须选择具体 provider', () => {
  const config = structuredClone(validConfig);
  config.advertising.provider = 'none';
  assert.throws(() => normalizeAndValidateProductConfig(config), /provider/);
});

test('Taku 作为当前 provider 时校验自己的广告位', () => {
  const config = structuredClone(validConfig);
  config.advertising.provider = 'taku';
  config.advertising.providers.taku = {
    registeredAppName: '示例应用',
    appId: '11', splashPlacementId: '12', feedPlacementId: '13',
    fullScreenPlacementId: '14', rewardPlacementId: '15',
  };
  assert.equal(normalizeAndValidateProductConfig(config).advertising.provider, 'taku');
});

test('关闭广告时允许不配置广告厂商', () => {
  const config = structuredClone(validConfig);
  config.modules.advertising = false;
  config.advertising = {provider: 'none', providers: {}};
  assert.equal(normalizeAndValidateProductConfig(config).advertising.provider, 'none');
});
