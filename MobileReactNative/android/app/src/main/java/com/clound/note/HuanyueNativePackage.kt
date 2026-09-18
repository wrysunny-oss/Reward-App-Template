package com.clound.note

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/** 注册无法通过 npm 自动链接的模板 Android 原生模块。 */
class HuanyueNativePackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> {
    val modules = mutableListOf<NativeModule>(AppConfigModule(context), RiskCollectorModule(context))
    if (BuildConfig.CONTENT_TYPE == "shortDrama") {
      val className = "${HuanyueNativePackage::class.java.packageName}.DramaContentModule"
      val module = Class.forName(className)
        .getConstructor(ReactApplicationContext::class.java)
        .newInstance(context) as NativeModule
      modules.add(module)
    }
    return modules
  }

  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
