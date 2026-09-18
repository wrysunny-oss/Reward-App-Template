import fs from 'node:fs';

export const productModuleKeys = [
  'shortDrama',
  'advertising',
  'rewards',
  'invitations',
  'smsRegistration',
  'withdrawals',
  'alipayPayout',
];

function required(value, key) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`product.config.json 缺少 ${key}`);
  return normalized;
}

function requiredBoolean(value, key) {
  if (typeof value !== 'boolean') {
    throw new Error(`product.config.json 的 ${key} 必须是 true 或 false`);
  }
  return value;
}

function numericId(value, key) {
  const normalized = required(value, key);
  if (!/^\d+$/.test(normalized)) throw new Error(`${key} 必须是纯数字字符串`);
  return normalized;
}

export function readProductConfig(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function normalizeAndValidateProductConfig(config) {
  const product = {
    schemaVersion: Number(config.schemaVersion),
    productCode: required(config.productCode, 'productCode'),
    brand: {
      appDisplayName: required(config.brand?.appDisplayName, 'brand.appDisplayName'),
      adminTitle: required(config.brand?.adminTitle, 'brand.adminTitle'),
      adminDescription: required(config.brand?.adminDescription, 'brand.adminDescription'),
      companyName: required(config.brand?.companyName, 'brand.companyName'),
      sdkAppName: required(config.brand?.sdkAppName, 'brand.sdkAppName'),
    },
    android: {
      applicationId: required(config.android?.applicationId, 'android.applicationId'),
    },
    admin: {
      namespace: required(config.admin?.namespace, 'admin.namespace'),
    },
    modules: Object.fromEntries(
      productModuleKeys.map((key) => [key, requiredBoolean(config.modules?.[key], `modules.${key}`)]),
    ),
    domains: {
      productionApiOrigin: required(config.domains?.productionApiOrigin, 'domains.productionApiOrigin').replace(/\/+$/, ''),
    },
    advertising: {
      gromore: {
        appId: numericId(config.advertising?.gromore?.appId, 'advertising.gromore.appId'),
        splashPlacementId: numericId(config.advertising?.gromore?.splashPlacementId, 'advertising.gromore.splashPlacementId'),
        feedPlacementId: numericId(config.advertising?.gromore?.feedPlacementId, 'advertising.gromore.feedPlacementId'),
        fullScreenPlacementId: numericId(config.advertising?.gromore?.fullScreenPlacementId, 'advertising.gromore.fullScreenPlacementId'),
        rewardPlacementId: numericId(config.advertising?.gromore?.rewardPlacementId, 'advertising.gromore.rewardPlacementId'),
      },
    },
  };

  if (product.schemaVersion !== 1) throw new Error('暂不支持该 product.config.json schemaVersion');
  if (!/^[a-z][a-z0-9-]*$/.test(product.productCode)) {
    throw new Error('productCode 只能使用小写字母、数字和连字符，且必须以字母开头');
  }
  if (!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/.test(product.android.applicationId)) {
    throw new Error('android.applicationId 格式无效');
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(product.admin.namespace)) {
    throw new Error('admin.namespace 只能使用小写字母、数字和连字符');
  }
  if (!/^https:\/\/[^/]+$/i.test(product.domains.productionApiOrigin)) {
    throw new Error('domains.productionApiOrigin 必须是无路径的 HTTPS 地址');
  }
  if (product.modules.alipayPayout && !product.modules.withdrawals) {
    throw new Error('modules.alipayPayout 启用时必须同时启用 modules.withdrawals');
  }
  if (product.modules.withdrawals && !product.modules.rewards) {
    throw new Error('modules.withdrawals 启用时必须同时启用 modules.rewards');
  }
  if (product.modules.invitations && !product.modules.rewards) {
    throw new Error('modules.invitations 启用时必须同时启用 modules.rewards');
  }

  return product;
}

export function applyModuleOverrides(config, overrides) {
  const next = structuredClone(config);
  next.modules ??= {};
  for (const [key, enabled] of overrides) {
    if (!productModuleKeys.includes(key)) throw new Error(`未知模块：${key}`);
    next.modules[key] = enabled;
  }
  return next;
}
