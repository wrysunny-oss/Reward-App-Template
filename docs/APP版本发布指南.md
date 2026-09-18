# APP 版本发布指南

本文说明奖励应用模板 Android APP 的版本号修改、正式打包、安装包上传和后台更新策略配置。

## 1. 版本字段

版本号定义在：

```text
MobileReactNative/android/app/build.gradle
```

找到 `defaultConfig`：

```gradle
defaultConfig {
    versionCode 1
    versionName "1.0"
}
```

- `versionCode` 是 Android 内部版本号，只能使用正整数，每次正式发布必须递增。
- `versionName` 是展示给用户的版本名称，建议采用 `主版本.次版本.修订版本`，例如 `1.0.1`。
- 已发布的 `versionCode` 不要重复使用，即使旧安装包已经下架。

发布 `1.0.1` 的示例：

```gradle
defaultConfig {
    versionCode 2
    versionName "1.0.1"
}
```

## 2. 发布前检查

在仓库根目录执行：

```powershell
npm.cmd run product:doctor -- --production
```

至少确认：

- `product.config.json` 中的 APP 名称、Android 包名、线上 API 和 GroMore 广告位正确。
- `versionCode` 高于上一个线上版本。
- 正式签名文件存在，签名密码通过环境变量提供。
- API 地址为正式 HTTPS 域名，不包含 `/api/v1`。
- GroMore 及聚合 ADN 所需 AAR 已准备完整。

## 3. 配置正式签名与环境

PowerShell 示例：

```powershell
cd D:\Project\Reward-App-Template\MobileReactNative\android

$env:REWARD_APP_ENV = "production"
$env:REWARD_APP_API_ORIGIN = "https://api.example.com"
$env:REWARD_APP_RELEASE_STORE_PASSWORD = "证书库密码"
$env:REWARD_APP_RELEASE_KEY_ALIAS = "证书别名"
$env:REWARD_APP_RELEASE_KEY_PASSWORD = "密钥密码"
```

默认签名文件为仓库根目录的 `my-release-key.keystore`。需要使用其他文件时设置：

```powershell
$env:REWARD_APP_RELEASE_STORE_FILE = "D:\安全目录\release.keystore"
```

密码不要写入 `build.gradle`、`.env` 示例或 Git 仓库。

## 4. 构建 APK 或 AAB

直接安装和官网下载通常使用 APK：

```powershell
.\gradlew.bat clean
.\gradlew.bat :app:assembleRelease
```

输出位置：

```text
MobileReactNative/android/app/build/outputs/apk/release/app-release.apk
```

应用商店通常使用 AAB：

```powershell
.\gradlew.bat :app:bundleRelease
```

输出位置：

```text
MobileReactNative/android/app/build/outputs/bundle/release/app-release.aab
```

## 5. 真机验证

发布前至少验证：

- 新安装、覆盖安装、登录和重新启动正常。
- APP 名称、图标、版本号和签名正确。
- 首页、短剧播放、激励广告、短剧解锁和金币到账正常。
- 注册短信、邀请关系、提现和协议页面正常。
- APP 连接的是正式 API，不是本地地址或内网穿透地址。

可以使用 Android 工具读取安装包版本：

```powershell
apkanalyzer manifest version-name app-release.apk
apkanalyzer manifest version-code app-release.apk
```

## 6. 上传安装包

将 APK 上传到可公开访问的 HTTPS 地址，并在浏览器中确认可以直接下载。建议文件名带版本号，避免 CDN 或浏览器缓存旧文件，例如：

```text
reward-app-1.0.1.apk
```

不要用同一个文件名直接覆盖旧包。发布前保留上一版 APK，便于回滚下载入口。

## 7. 在管理后台发布版本

进入：

```text
运营配置 → App 版本 → 新增版本策略
```

填写内容必须与安装包一致：

| 字段 | 示例 | 说明 |
| --- | --- | --- |
| 平台 | Android | 当前 APP 检查时使用 Android |
| 版本名称 | `1.0.1` | 与 `versionName` 一致 |
| 当前版本号 | `2` | 与 `versionCode` 一致 |
| 最低兼容版本 | `1` 或 `2` | 决定是否强制升级 |
| APK 下载地址 | HTTPS 地址 | 必须能公开访问 |
| 灰度比例 | `100` | 0–100，按设备稳定分桶 |
| 发布时间 | 当前或计划时间 | 未到时间不会下发 |
| 启用 | 开启 | 未启用不会下发 |

策略示例：

- 普通更新：最新 `versionCode=2`，`minVersionCode=1`。版本 1 用户可稍后更新。
- 强制更新：最新 `versionCode=2`，`minVersionCode=2`。所有低于 2 的用户必须更新。
- 分批发布：先设置灰度比例 10%，观察稳定后逐步提高到 100%。

## 8. 当前更新机制

APP 冷启动时调用 `/api/v1/operations/version-check`：

- 没有新版本时不打扰用户。
- 普通更新允许“稍后再说”，同一版本 24 小时内不重复提醒。
- 强制更新不能关闭弹窗。
- 点击立即更新会通过系统打开后台配置的 HTTPS 下载地址。

当前不支持应用内静默安装或热更新。APP 一直停留在前台时不会重复检查，需要重新启动后触发。

## 9. 发布后检查

- [ ] 使用旧版 APP 冷启动后能收到更新提示。
- [ ] 普通更新可以稍后关闭，强制更新不能跳过。
- [ ] 下载按钮打开的是本次发布的 APK。
- [ ] 下载后的 APK 版本号、签名和 API 地址正确。
- [ ] 管理后台灰度比例和启用状态符合发布计划。
- [ ] `/download` 下载页展示最新公开版本。

## 10. 回滚

发现严重问题时，先在管理后台停用问题版本或把灰度比例调整为 0。修复后使用更大的 `versionCode` 发布新包；不要尝试用旧 `versionCode` 覆盖已经发布的安装包。
