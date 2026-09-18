// 此文件由 scripts/sync-product-config.mjs 自动生成，请勿手动修改。
export const productConfig = {
  "schemaVersion": 1,
  "productCode": "fushang-theater",
  "brand": {
    "appDisplayName": "富商剧场",
    "adminTitle": "富商剧场管理后台",
    "adminDescription": "富商剧场运营管理后台",
    "companyName": "南通江满科技",
    "sdkAppName": "富商笔记"
  },
  "android": {
    "applicationId": "com.clound.note"
  },
  "admin": {
    "namespace": "hanle-theater-admin"
  },
  "modules": {
    "shortDrama": true,
    "advertising": true,
    "rewards": true,
    "invitations": true,
    "smsRegistration": true,
    "withdrawals": true,
    "alipayPayout": true
  },
  "domains": {
    "productionApiOrigin": "https://api.nantongjiangnan.cn"
  },
  "advertising": {
    "gromore": {
      "appId": "5879132",
      "splashPlacementId": "104516017",
      "feedPlacementId": "104517426",
      "fullScreenPlacementId": "104516612",
      "rewardPlacementId": "104489019"
    }
  }
} as const;

export const productModules = productConfig.modules;
export type ProductModuleKey = keyof typeof productModules;
export type ProductModules = Record<ProductModuleKey, boolean>;
