package com.clound.note

import android.content.Intent
import android.os.Build
import android.util.Log
import com.bytedance.sdk.djx.DJXSdk
import com.bytedance.sdk.djx.DJXSdkConfig
import com.bytedance.sdk.djx.IDJXService
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.lang.ref.WeakReference
import com.bytedance.sdk.djx.model.DJXDrama
import com.bytedance.sdk.djx.model.DJXError
import com.bytedance.sdk.djx.model.DJXOthers
import com.bytedance.sdk.djx.model.DJXUser

/** Pangrowth 内容 SDK 的 React Native 桥接入口。 */
class DramaContentModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  init {
    reactContextRef = WeakReference(reactContext)
  }

  override fun getName(): String = "DramaContent"

  @ReactMethod
  fun initialize(configName: String, debug: Boolean, promise: Promise) {
    if (DJXSdk.isStartSuccess()) {
      promise.resolve(null)
      return
    }

    try {
      reactContext.assets.open(configName).use { stream ->
        check(stream.available() > 0) { "短剧 SDK 配置文件为空" }
      }

      UiThreadUtil.runOnUiThread {
        try {
          val builder = DJXSdkConfig.Builder()
          builder.debug(debug)
          DJXSdk.init(reactContext.applicationContext, configName, builder.build())
          DJXSdk.start { success, message, error ->
            if (success) {
              promise.resolve(null)
            } else {
              val detail = error?.toString()?.takeIf { it.isNotBlank() } ?: message
              promise.reject("DRAMA_START_FAILED", detail ?: "内容 SDK 启动失败")
            }
          }
        } catch (error: Throwable) {
          promise.reject("DRAMA_INIT_FAILED", error.message, error)
        }
      }
    } catch (error: Throwable) {
      promise.reject("DRAMA_CONFIG_INVALID", "无法读取 $configName", error)
    }
  }

  @ReactMethod
  fun isReady(promise: Promise) {
    promise.resolve(DJXSdk.isStartSuccess())
  }

  /** 使用幻乐账号 ID 登录穿山甲服务，使 SDK 收藏和历史按账号隔离。 */
  @ReactMethod
  fun loginUser(userId: String, promise: Promise) {
    if (!DJXSdk.isStartSuccess()) return promise.reject("DRAMA_NOT_INITIALIZED", "短剧 SDK 尚未初始化成功")
    if (userId.isBlank()) return promise.reject("DRAMA_USER_INVALID", "用户标识不能为空")
    val service = DJXSdk.service()
    if (sdkUserId == userId && service.isLogin) return promise.resolve(null)
    fun performLogin() {
      service.login(userId, object : IDJXService.IDJXCallback<DJXUser> {
        override fun onSuccess(data: DJXUser?, others: DJXOthers?) {
          sdkUserId = userId
          promise.resolve(null)
        }
        override fun onError(error: DJXError) = promise.reject("DRAMA_LOGIN_FAILED", error.toString())
      })
    }
    if (!service.isLogin) return performLogin()
    service.logout(object : IDJXService.IDJXCallback<DJXUser> {
      override fun onSuccess(data: DJXUser?, others: DJXOthers?) {
        sdkUserId = null
        performLogin()
      }
      override fun onError(error: DJXError) = promise.reject("DRAMA_LOGOUT_FAILED", error.toString())
    })
  }

  /** APP 主动收藏时双写 SDK；后端仍是账号收藏的最终数据源。 */
  @ReactMethod
  fun setFavorite(dramaId: String, episodeIndex: Int, state: Boolean, promise: Promise) {
    val numericId = dramaId.toLongOrNull()
    if (numericId == null || numericId <= 0L) return promise.reject("DRAMA_ID_INVALID", "无效的短剧内容 ID")
    DJXSdk.service().favorDrama(numericId, episodeIndex.coerceAtLeast(1), state, object : IDJXService.IDJXCallback<Any> {
      override fun onSuccess(data: Any?, others: DJXOthers?) = promise.resolve(null)
      override fun onError(error: DJXError) = promise.reject("DRAMA_FAVOR_FAILED", error.toString())
    })
  }

  /** 分页读取 SDK 收藏和历史快照；最多各读取 400 部，防止异常分页无限递归。 */
  @ReactMethod
  fun getLibrarySnapshot(promise: Promise) {
    if (!DJXSdk.isStartSuccess()) return promise.reject("DRAMA_NOT_INITIALIZED", "短剧 SDK 尚未初始化成功")
    val favorites = linkedMapOf<Long, DJXDrama>()
    val histories = linkedMapOf<Long, DJXDrama>()
    var settled = false
    var favoritesAvailable = false
    var historiesAvailable = false

    fun resolveSnapshot() {
      if (settled) return
      settled = true
      val result = Arguments.createMap()
      val favoriteArray = Arguments.createArray()
      favorites.values.forEach { drama -> favoriteArray.pushMap(dramaSnapshot(drama)) }
      val historyArray = Arguments.createArray()
      histories.values.forEach { drama -> historyArray.pushMap(dramaSnapshot(drama)) }
      result.putArray("favorites", favoriteArray)
      result.putArray("histories", historyArray)
      result.putBoolean("favoritesAvailable", favoritesAvailable)
      result.putBoolean("historiesAvailable", historiesAvailable)
      promise.resolve(result)
    }
    fun loadHistory(page: Int) {
      DJXSdk.service().getDramaHistory(page, SNAPSHOT_PAGE_SIZE, object : IDJXService.IDJXCallback<List<out DJXDrama>> {
        override fun onSuccess(data: List<DJXDrama>?, others: DJXOthers?) {
          data.orEmpty().forEach { histories[it.id] = it }
          if (others?.hasMore == true && page < SNAPSHOT_MAX_PAGES) {
            loadHistory(page + 1)
          } else {
            historiesAvailable = true
            resolveSnapshot()
          }
        }
        override fun onError(error: DJXError) {
          Log.w(TAG, "Unable to read Pangrowth history; favorite sync will continue: $error")
          resolveSnapshot()
        }
      })
    }
    fun loadFavorites(page: Int) {
      DJXSdk.service().getFavorList(page, SNAPSHOT_PAGE_SIZE, object : IDJXService.IDJXCallback<List<out DJXDrama>> {
        override fun onSuccess(data: List<DJXDrama>?, others: DJXOthers?) {
          data.orEmpty().forEach { favorites[it.id] = it }
          if (others?.hasMore == true && page < SNAPSHOT_MAX_PAGES) {
            loadFavorites(page + 1)
          } else {
            favoritesAvailable = true
            loadHistory(1)
          }
        }
        override fun onError(error: DJXError) {
          Log.w(TAG, "Unable to read Pangrowth favorites; history sync will continue: $error")
          loadHistory(1)
        }
      })
    }
    loadFavorites(1)
  }

  /** dramaId 为穿山甲内容 ID；episodeIndex 为 App 使用的零基下标。 */
  @ReactMethod
  fun openDramaDetail(dramaId: String, episodeIndex: Int, config: ReadableMap, promise: Promise) {
    if (!DJXSdk.isStartSuccess()) {
      promise.reject("DRAMA_NOT_INITIALIZED", "短剧 SDK 尚未初始化成功")
      return
    }

    val numericDramaId = dramaId.toLongOrNull()
    if (numericDramaId == null || numericDramaId <= 0L) {
      promise.reject("DRAMA_ID_INVALID", "无效的短剧内容 ID：$dramaId")
      return
    }

    val activity = reactApplicationContext.currentActivity
    if (activity == null) {
      promise.reject("DRAMA_ACTIVITY_MISSING", "当前没有可用于打开播放器的 Activity")
      return
    }

    UiThreadUtil.runOnUiThread {
      try {
        val intent = Intent(activity, DramaPlayerActivity::class.java).apply {
          putExtra(DramaPlayerActivity.EXTRA_DRAMA_ID, numericDramaId)
          putExtra(DramaPlayerActivity.EXTRA_EPISODE_INDEX, episodeIndex.coerceAtLeast(0))
          putExtra(DramaPlayerActivity.EXTRA_UNLOCK_MODE, config.getString("unlockMode") ?: "SPECIFIC")
          putExtra(DramaPlayerActivity.EXTRA_FREE_EPISODES, config.getInt("freeEpisodes"))
          putExtra(DramaPlayerActivity.EXTRA_UNLOCK_EPISODES, config.getInt("unlockEpisodes"))
          putExtra(DramaPlayerActivity.EXTRA_CONTINUOUS_UNLOCK, config.getBoolean("continuousUnlock"))
          putExtra(DramaPlayerActivity.EXTRA_HIDE_REWARD_DIALOG, config.getBoolean("hideRewardDialog"))
          putExtra(DramaPlayerActivity.EXTRA_HIDE_CELLULAR_TOAST, config.getBoolean("hideCellularToast"))
          putExtra(DramaPlayerActivity.EXTRA_HIDE_LIKE_BUTTON, config.getBoolean("hideLikeButton"))
          putExtra(DramaPlayerActivity.EXTRA_HIDE_FAVOR_BUTTON, config.getBoolean("hideFavorButton"))
          putExtra(DramaPlayerActivity.EXTRA_HIDE_DOUBLE_CLICK, config.getBoolean("hideDoubleClick"))
          putExtra(DramaPlayerActivity.EXTRA_HIDE_LONG_CLICK_SPEED, config.getBoolean("hideLongClickSpeed"))
          putExtra(DramaPlayerActivity.EXTRA_INFINITE_SCROLL, config.getBoolean("infiniteScrollEnabled"))
        }
        activity.startActivity(intent)
        promise.resolve(null)
      } catch (error: Throwable) {
        promise.reject("DRAMA_OPEN_FAILED", error.message, error)
      }
    }
  }

  @ReactMethod
  fun notifyUnlockAdShown(requestId: String, cpm: String, promise: Promise) {
    val accepted = DramaPlayerActivity.notifyCustomAdShown(requestId, cpm)
    if (accepted) promise.resolve(null)
    else promise.reject("DRAMA_UNLOCK_REQUEST_EXPIRED", "短剧解锁广告请求已失效")
  }

  @ReactMethod
  fun resolveUnlockAd(requestId: String, success: Boolean, transactionId: String, cpm: String, promise: Promise) {
    val accepted = DramaPlayerActivity.resolveCustomAd(requestId, success, transactionId, cpm)
    if (accepted) promise.resolve(null)
    else promise.reject("DRAMA_UNLOCK_REQUEST_EXPIRED", "短剧解锁广告请求已失效")
  }

  @ReactMethod
  fun showUnlockReward(awardedCoins: String, coinBalance: String, promise: Promise) {
    val shown = DramaPlayerActivity.showRewardReceipt(awardedCoins, coinBalance)
    if (shown) promise.resolve(null)
    else promise.reject("DRAMA_PLAYER_MISSING", "短剧播放器已经关闭")
  }

  /** NativeEventEmitter 在 Android 侧要求模块声明这两个订阅方法。 */
  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Int) = Unit

  companion object {
    private const val TAG = "DramaContentModule"
    const val PLAYBACK_EVENT_NAME = "hlyDramaPlayback"
    const val PANGROWTH_SDK_VERSION = "3.0.0.2"

    private var reactContextRef: WeakReference<ReactApplicationContext>? = null
    @Volatile private var sdkUserId: String? = null
    private const val SNAPSHOT_PAGE_SIZE = 20
    private const val SNAPSHOT_MAX_PAGES = 20

    private fun dramaSnapshot(drama: DJXDrama) = Arguments.createMap().apply {
      putString("externalId", drama.id.toString())
      putInt("episodeIndex", drama.index.coerceAtLeast(1))
      putDouble("actionTime", drama.actionTime.toDouble())
    }

    fun emitPlaybackEvent(
      eventType: String,
      dramaId: Long,
      episodeIndex: Int,
      sessionId: String? = null,
      elapsedSeconds: Int? = null,
    ) {
      val context = reactContextRef?.get() ?: return
      if (!context.hasActiveReactInstance()) return
      val payload = Arguments.createMap().apply {
        putString("eventType", eventType)
        putString("externalId", dramaId.toString())
        putInt("episodeIndex", episodeIndex.coerceAtLeast(1))
        putString("deviceModel", Build.MODEL)
        putString("abi", Build.SUPPORTED_ABIS.firstOrNull())
        putString("sdkVersion", PANGROWTH_SDK_VERSION)
        sessionId?.let { putString("sessionId", it) }
        elapsedSeconds?.let { putInt("elapsedSeconds", it.coerceAtLeast(1)) }
      }
      context
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(PLAYBACK_EVENT_NAME, payload)
    }

    fun emitUnlockAdRequest(requestId: String, dramaId: Long, episodeIndex: Int) {
      val context = reactContextRef?.get() ?: return
      if (!context.hasActiveReactInstance()) return
      val payload = Arguments.createMap().apply {
        putString("eventType", "UNLOCK_AD_REQUEST")
        putString("requestId", requestId)
        putString("externalId", dramaId.toString())
        putInt("episodeIndex", episodeIndex.coerceAtLeast(1))
      }
      context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(PLAYBACK_EVENT_NAME, payload)
    }
  }
}
