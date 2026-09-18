# 富商剧场 React Native APP

## 页面迁移状态

旧版 uni-app 工程已归档到仓库根目录的 `UniAppBackup/Frontend`。新版已包含登录与邀请码注册、首页、福利、收益、我的、个人资料、账户安全、支付宝绑定、提现、邀请、收藏、观看历史、通知、搜索、设置、关于、帮助反馈、用户协议、隐私政策和短剧详情页。

页面代码按业务存放于 `src/features`，接口统一收口在 `src/api/app.ts`。穿山甲播放器当前保留类型安全的原生边界，Android SDK 实现放在页面迁移之后进行。

这是从 `UniAppBackup/Frontend` 迁移出的独立 Android 客户端。归档工程不参与当前构建，本工程不包含 DCloud、UTS 或 uni-ad 运行库。

## 技术栈

- React Native 0.84 + TypeScript
- React Navigation
- Zustand
- Axios
- AsyncStorage
- Android Kotlin 原生模块（后续承载 GroMore、Pangrowth 和风控）

## 本地运行

1. 启动现有 Express 后端（3000 端口）。
2. 执行 `adb reverse tcp:3000 tcp:3000`。
3. 在本目录运行 `npm start`。
4. 另开终端运行 `npm run android`。

Android Debug 默认接口地址为 `http://10.0.2.2:3000/api/v1`，即 Android Studio 模拟器访问宿主机的地址。

可通过 Gradle 参数构建连接测试环境的 Debug 包：

```powershell
cd android
gradle :app:assembleDebug -PAPP_ENV=test -PAPP_API_ORIGIN=https://test-api.example.com
```

正式包必须明确配置 HTTPS API 根地址和正式签名证书，否则构建会中止。证书密码只通过本机环境变量或 CI 密钥注入，不写入仓库：

```powershell
cd android
$env:HLY_APP_ENV = "production"
$env:HLY_API_ORIGIN = "https://api.example.com"
# 默认读取仓库根目录 my-release-key.keystore；需要使用其他证书时才设置此项。
# $env:HLY_RELEASE_STORE_FILE = "D:\path\other-release.keystore"
$env:HLY_RELEASE_STORE_PASSWORD = "由本机安全配置提供"
$env:HLY_RELEASE_KEY_ALIAS = "由证书信息提供"
$env:HLY_RELEASE_KEY_PASSWORD = "由本机安全配置提供"
.\gradlew.bat :app:assembleRelease
```

也可以使用环境变量 `HLY_APP_ENV` 和 `HLY_API_ORIGIN`。API 地址不要包含 `/api/v1`，客户端会自动追加。版本展示和请求头统一读取 Android `versionName`、`versionCode`。

修改版本号、生成 APK/AAB、上传安装包并在管理后台配置更新策略时，按照 [APP 版本发布指南](../docs/APP版本发布指南.md) 操作。

## 迁移原则

- 页面按业务模块存放在 `src/features`，避免不同业务互相引用内部实现。
- 所有后端请求只能通过 `src/api`，统一处理 Token 刷新和错误。
- 原生 SDK 只通过独立 Kotlin Native Module 暴露给 TypeScript。
- 用户同意隐私协议前，不初始化广告、短剧内容或风控 SDK。
