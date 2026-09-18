package com.clound.note

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/** 注册无法通过 npm 自动链接的富商剧场 Android 原生模块。 */
class HuanyueNativePackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
    // GroMore 已由 react-native-playnest-unionad 自动链接，这里只保留项目私有模块。
    listOf(AppConfigModule(context), DramaContentModule(context), RiskCollectorModule(context))

  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
