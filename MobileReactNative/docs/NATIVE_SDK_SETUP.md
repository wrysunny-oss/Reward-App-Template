# Android 原生 SDK 依赖准备

项目不使用 uni-ad。GroMore 与 Pangrowth 均由原生 Android Gradle 直接接入。

## 下载依赖

在 `MobileReactNative` 目录执行：

```powershell
cd D:\Project\Reward-App-Template\MobileReactNative\android
.\gradlew.bat :app:dependencies --configuration debugRuntimeClasspath --refresh-dependencies
```

若只希望预下载并验证编译依赖：

```powershell
cd D:\Project\Reward-App-Template\MobileReactNative\android
.\gradlew.bat :app:compileDebugKotlin --refresh-dependencies --stacktrace
```

当前版本坐标：

- `com.pangle_beta.cn:mediation-sdk:7.7.1.6`
- `com.pangle.cn:pangrowth-base:3.0.0.2`
- `com.pangle.cn:pangrowth-djx-sdk-lite:3.0.0.2`

仓库地址已经写入根 `build.gradle`：

- `https://artifact.bytedance.com/repository/pangle`
- `https://artifact.bytedance.com/repository/Volcengine`

下载完成后不要手工复制 Gradle 缓存。将首次编译输出发回即可继续按实际 AAR API 完成短剧播放器适配。

## 本地 AAR 备用方案

如果 Maven 无法访问，可将官方 AAR 放进 `android/app/libs`，然后把对应 Maven
依赖注释掉，并在 `android/app/build.gradle` 的 dependencies 中加入：

```gradle
implementation fileTree(dir: "libs", include: ["*.jar", "*.aar"])
```

不要同时引入同一 SDK 的 Maven 包和 AAR，否则会出现重复类冲突。
