# GroMore 多 ADN 本地 SDK

从穿山甲后台“接入工具 → 下载SDK”取得原生 SDK，并将以下文件原样放入本目录：

- `GDTSDK.unionNormal.4.680.1550.aar`（优量汇）
- `Baidu_MobAds_SDK_v9.4503.aar`（百度）
- `kssdk-ad-5.3.20.1.aar`（快手）
- `windAd-4.25.14.aar`（Sigmob）
- `windAd-common-2.0.1.aar`（Sigmob 公共库）

这些文件与 `android/app/build.gradle` 中的 GroMore adapter 版本一一对应。升级任一平台 SDK 时，必须在穿山甲接入工具中重新生成依赖，并同时更新 adapter、AAR 文件名和本清单。

AAR 默认不提交到 Git，正式打包机器需要单独保留这一目录中的文件。
