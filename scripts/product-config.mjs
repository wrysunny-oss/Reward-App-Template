import fs from 'node:fs';

export const productModuleKeys = [
  'advertising',
  'rewards',
  'invitations',
  'smsRegistration',
  'withdrawals',
  'alipayPayout',
];

export const contentTypes = ['none', 'shortDrama', 'quiz', 'novel', 'music'];
export const advertisingProviders = ['none', 'gromore', 'taku'];

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

function optionalNumericId(value, key) {
  const normalized = String(value ?? '').trim();
  if (normalized && !/^\d+$/.test(normalized)) throw new Error(`${key} 必须是纯数字字符串`);
  return normalized;
}

function providerConfig(config, provider, selectedProvider) {
  const source = config.advertising?.providers?.[provider] ?? {};
  const readId = selectedProvider === provider ? numericId : optionalNumericId;
  return {
    registeredAppName: selectedProvider === provider
      ? required(source.registeredAppName, `advertising.providers.${provider}.registeredAppName`)
      : String(source.registeredAppName ?? '').trim(),
    appId: readId(source.appId, `advertising.providers.${provider}.appId`),
    splashPlacementId: readId(source.splashPlacementId, `advertising.providers.${provider}.splashPlacementId`),
    feedPlacementId: readId(source.feedPlacementId, `advertising.providers.${provider}.feedPlacementId`),
    fullScreenPlacementId: readId(source.fullScreenPlacementId, `advertising.providers.${provider}.fullScreenPlacementId`),
    rewardPlacementId: readId(source.rewardPlacementId, `advertising.providers.${provider}.rewardPlacementId`),
  };
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
    content: {
      type: required(config.content?.type, 'content.type'),
      providers: {
        ...(config.content?.providers?.shortDrama ? {
          shortDrama: {
            sdkSettingId: config.content?.type === 'shortDrama'
              ? numericId(config.content.providers.shortDrama.sdkSettingId, 'content.providers.shortDrama.sdkSettingId')
              : optionalNumericId(config.content.providers.shortDrama.sdkSettingId, 'content.providers.shortDrama.sdkSettingId'),
          },
        } : {}),
      },
    },
    domains: {
      productionApiOrigin: required(config.domains?.productionApiOrigin, 'domains.productionApiOrigin').replace(/\/+$/, ''),
    },
    advertising: {
      provider: required(config.advertising?.provider, 'advertising.provider'),
      providers: {
        ...(config.advertising?.providers?.gromore ? { gromore: providerConfig(config, 'gromore', config.advertising?.provider) } : {}),
        ...(config.advertising?.providers?.taku ? { taku: providerConfig(config, 'taku', config.advertising?.provider) } : {}),
      },
    },
  };

  if (product.schemaVersion !== 2) throw new Error('暂不支持该 product.config.json schemaVersion');
  if (!contentTypes.includes(product.content.type)) throw new Error(`content.type 必须是：${contentTypes.join(', ')}`);
  if (product.content.type === 'shortDrama' && !product.content.providers.shortDrama) {
    throw new Error('content.providers.shortDrama 缺少当前内容插件配置');
  }
  if (!advertisingProviders.includes(product.advertising.provider)) throw new Error(`advertising.provider 必须是：${advertisingProviders.join(', ')}`);
  if (product.advertising.provider !== 'none' && !product.advertising.providers[product.advertising.provider]) {
    throw new Error(`advertising.providers.${product.advertising.provider} 缺少当前广告平台配置`);
  }
  if (product.modules.advertising && product.advertising.provider === 'none') {
    throw new Error('modules.advertising 启用时 advertising.provider 不能是 none');
  }
  if (!product.modules.advertising && product.advertising.provider !== 'none') {
    throw new Error('modules.advertising 关闭时 advertising.provider 必须是 none');
  }
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
