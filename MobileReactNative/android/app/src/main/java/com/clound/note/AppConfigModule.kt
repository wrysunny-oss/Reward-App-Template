package com.clound.note

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule

/** 将 Android 构建时确定的环境信息作为只读常量提供给 React Native。 */
class AppConfigModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName(): String = "AppConfig"

  override fun getConstants(): Map<String, Any> = mapOf(
    "environment" to BuildConfig.APP_ENV,
    "apiOrigin" to BuildConfig.API_ORIGIN,
    "versionName" to BuildConfig.VERSION_NAME,
    "versionCode" to BuildConfig.VERSION_CODE,
    "debug" to BuildConfig.DEBUG,
  )
}
