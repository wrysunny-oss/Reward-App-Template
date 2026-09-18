package com.clound.note

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.animation.ValueAnimator
import android.app.Dialog
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.bytedance.sdk.djx.DJXSdk
import com.bytedance.sdk.djx.DJXRewardAdResult
import com.bytedance.sdk.djx.IDJXWidget
import com.bytedance.sdk.djx.interfaces.listener.IDJXDramaListener
import com.bytedance.sdk.djx.interfaces.listener.IDJXDramaUnlockListener
import com.bytedance.sdk.djx.model.DJXDrama
import com.bytedance.sdk.djx.model.DJXDramaDetailConfig
import com.bytedance.sdk.djx.model.DJXDramaUnlockAdMode
import com.bytedance.sdk.djx.model.DJXDramaUnlockInfo
import com.bytedance.sdk.djx.model.DJXDramaUnlockMethod
import com.bytedance.sdk.djx.model.DJXUnlockModeType
import com.bytedance.sdk.djx.params.DJXWidgetDramaDetailParams
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.UUID
import java.lang.ref.WeakReference

/** 承载 Pangrowth 官方短剧播放器 Fragment 的宿主页面。 */
class DramaPlayerActivity : AppCompatActivity() {
  private var dramaWidget: IDJXWidget? = null
  private val heartbeatHandler = Handler(Looper.getMainLooper())
  private val playbackSessionId = UUID.randomUUID().toString()
  private var activeStartedAtMs: Long? = null
  private var accumulatedActiveMs = 0L
  private var playbackStarted = false
  private var currentDramaId = 0L
  private var currentEpisodeIndex = 1
  private var lastReportedSeconds = 0
  private val playerClosedReported = AtomicBoolean(false)
  private var pendingUnlockRequestId: String? = null
  private var pendingUnlockCallback: IDJXDramaUnlockListener.CustomAdCallback? = null
  private var pendingUnlockAdShown = false
  private val unlockTimeout = Runnable { completeCustomAd(false, "", "") }
  private val heartbeat = object : Runnable {
    override fun run() {
      reportWatchProgress()
      heartbeatHandler.postDelayed(this, HEARTBEAT_INTERVAL_MS)
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    if (!DJXSdk.isStartSuccess()) {
      showLaunchError("短剧 SDK 尚未初始化成功")
      return
    }

    val dramaId = intent.getLongExtra(EXTRA_DRAMA_ID, 0L)
    val requestedEpisodeIndex = intent.getIntExtra(EXTRA_EPISODE_INDEX, 0).coerceAtLeast(0)
    // App 使用零基下标，Pangrowth 3.0.0.2 的详情播放器要求集数从 1 开始。
    val sdkEpisodeIndex = requestedEpisodeIndex + 1
    if (dramaId <= 0L) {
      showLaunchError("短剧内容 ID 无效")
      return
    }
    currentDramaId = dramaId
    currentEpisodeIndex = sdkEpisodeIndex
    activeActivity = WeakReference(this)

    val container = FrameLayout(this).apply {
      id = View.generateViewId()
      setBackgroundColor(android.graphics.Color.BLACK)
    }
    setContentView(container)

    val unlockMode = if (intent.getStringExtra(EXTRA_UNLOCK_MODE) == "COMMON") DJXDramaUnlockAdMode.MODE_COMMON else DJXDramaUnlockAdMode.MODE_SPECIFIC
    val unlockEpisodes = intent.getIntExtra(EXTRA_UNLOCK_EPISODES, DEFAULT_UNLOCK_EPISODES).coerceIn(1, MAX_UNLOCK_EPISODES)
    val detailConfig = DJXDramaDetailConfig.obtain(
      unlockMode,
      intent.getIntExtra(EXTRA_FREE_EPISODES, DEFAULT_FREE_EPISODES).coerceAtLeast(0),
      DefaultUnlockListener(unlockEpisodes, intent.getBooleanExtra(EXTRA_CONTINUOUS_UNLOCK, false)),
    )
      .hideRewardDialog(intent.getBooleanExtra(EXTRA_HIDE_REWARD_DIALOG, false))
      .hideCellularToast(intent.getBooleanExtra(EXTRA_HIDE_CELLULAR_TOAST, false))
      .hideLikeButton(intent.getBooleanExtra(EXTRA_HIDE_LIKE_BUTTON, false))
      .hideFavorButton(intent.getBooleanExtra(EXTRA_HIDE_FAVOR_BUTTON, false))
      .hideDoubleClick(intent.getBooleanExtra(EXTRA_HIDE_DOUBLE_CLICK, false))
      .hideLongClickSpeed(intent.getBooleanExtra(EXTRA_HIDE_LONG_CLICK_SPEED, false))
      .infiniteScrollEnabled(intent.getBooleanExtra(EXTRA_INFINITE_SCROLL, true))
      .listener(PlaybackValidationListener(
        dramaId,
        sdkEpisodeIndex,
        onEpisodeChanged = { currentEpisodeIndex = it },
        onPlaybackStarted = { episodeIndex -> startWatchHeartbeat(episodeIndex) },
        onPlayerClosed = { reportPlayerClosed() },
      ))

    val params = DJXWidgetDramaDetailParams.obtain(dramaId, sdkEpisodeIndex, detailConfig)
    dramaWidget = DJXSdk.factory().createDramaDetail(params)

    val fragment = dramaWidget?.fragment
    if (fragment == null) {
      showLaunchError("穿山甲播放器创建失败")
      return
    }

    supportFragmentManager.beginTransaction()
      .replace(container.id, fragment, FRAGMENT_TAG)
      .commit()
  }

  private fun showLaunchError(message: String) {
    Log.e(TAG, message)
    Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    finish()
  }

  @Deprecated("Deprecated in Android SDK; retained for the Pangrowth back-stack contract")
  override fun onBackPressed() {
    val widget = dramaWidget
    if (widget != null && widget.canBackPress()) {
      widget.backRefresh()
      return
    }
    super.onBackPressed()
  }

  override fun onDestroy() {
    completeCustomAd(false, "", "")
    if (activeActivity?.get() === this) activeActivity = null
    stopWatchHeartbeat(reportFinal = true)
    reportPlayerClosed()
    dramaWidget?.destroy()
    dramaWidget = null
    super.onDestroy()
  }

  private fun reportPlayerClosed() {
    if (!playerClosedReported.compareAndSet(false, true) || currentDramaId <= 0L) return
    DramaContentModule.emitPlaybackEvent(EVENT_PLAYER_CLOSED, currentDramaId, currentEpisodeIndex, playbackSessionId)
  }

  override fun onResume() {
    super.onResume()
    if (playbackStarted && activeStartedAtMs == null) {
      activeStartedAtMs = SystemClock.elapsedRealtime()
      heartbeatHandler.removeCallbacks(heartbeat)
      heartbeatHandler.postDelayed(heartbeat, HEARTBEAT_INTERVAL_MS)
    }
  }

  override fun onPause() {
    stopWatchHeartbeat(reportFinal = true)
    super.onPause()
  }

  private fun startWatchHeartbeat(episodeIndex: Int) {
    currentEpisodeIndex = episodeIndex.coerceAtLeast(1)
    if (playbackStarted) return
    playbackStarted = true
    activeStartedAtMs = SystemClock.elapsedRealtime()
    heartbeatHandler.removeCallbacks(heartbeat)
    heartbeatHandler.postDelayed(heartbeat, HEARTBEAT_INTERVAL_MS)
  }

  private fun stopWatchHeartbeat(reportFinal: Boolean) {
    val startedAt = activeStartedAtMs
    if (startedAt != null) {
      accumulatedActiveMs += SystemClock.elapsedRealtime() - startedAt
      activeStartedAtMs = null
    }
    heartbeatHandler.removeCallbacks(heartbeat)
    if (reportFinal) reportWatchProgress()
  }

  private fun reportWatchProgress() {
    if (!playbackStarted || currentDramaId <= 0L) return
    val runningMs = activeStartedAtMs?.let { SystemClock.elapsedRealtime() - it } ?: 0L
    val elapsedSeconds = ((accumulatedActiveMs + runningMs) / 1_000L).toInt()
    if (elapsedSeconds < MIN_REPORT_SECONDS || elapsedSeconds <= lastReportedSeconds) return
    lastReportedSeconds = elapsedSeconds
    DramaContentModule.emitPlaybackEvent(
      EVENT_WATCH_PROGRESS,
      currentDramaId,
      currentEpisodeIndex,
      playbackSessionId,
      elapsedSeconds,
    )
  }

  /** 将 SDK 确认的内容请求与真实开播事件转发给 React Native。 */
  private class PlaybackValidationListener(
    private val dramaId: Long,
    initialEpisodeIndex: Int,
    private val onEpisodeChanged: (Int) -> Unit,
    private val onPlaybackStarted: (Int) -> Unit,
    private val onPlayerClosed: () -> Unit,
  ) : IDJXDramaListener() {
    private val currentEpisodeIndex = AtomicInteger(initialEpisodeIndex.coerceAtLeast(1))
    private val requestReported = AtomicBoolean(false)

    override fun onDJXPageChange(index: Int, map: MutableMap<String, Any>?) {
      val episodeIndex = index.coerceAtLeast(1)
      currentEpisodeIndex.set(episodeIndex)
      onEpisodeChanged(episodeIndex)
    }

    override fun onDJXRequestSuccess(list: MutableList<MutableMap<String, Any>>?) {
      if (requestReported.compareAndSet(false, true)) {
        DramaContentModule.emitPlaybackEvent(
          EVENT_REQUEST_SUCCEEDED,
          dramaId,
          currentEpisodeIndex.get(),
        )
      }
    }

    override fun onDJXVideoPlay(map: MutableMap<String, Any>?) {
      onPlaybackStarted(currentEpisodeIndex.get())
      DramaContentModule.emitPlaybackEvent(
        EVENT_PLAYBACK_STARTED,
        dramaId,
        currentEpisodeIndex.get(),
      )
    }

    override fun onDJXClose() = onPlayerClosed()
  }

  private inner class DefaultUnlockListener(
    private val unlockEpisodes: Int,
    private val continuousUnlock: Boolean,
  ) : IDJXDramaUnlockListener {
    override fun unlockFlowStart(
      drama: DJXDrama,
      callback: IDJXDramaUnlockListener.UnlockCallback,
      map: Map<String, Any>?,
    ) {
      callback.onConfirm(
        DJXDramaUnlockInfo(
          drama.id,
          unlockEpisodes,
          DJXDramaUnlockMethod.METHOD_AD,
          false,
          "",
          false,
          if (continuousUnlock) DJXUnlockModeType.UNLOCKTYPE_CONTINUES else DJXUnlockModeType.UNLOCKTYPE_DEFAULT,
        ),
      )
    }

    override fun unlockFlowEnd(
      drama: DJXDrama,
      errCode: IDJXDramaUnlockListener.UnlockErrorStatus?,
      map: Map<String, Any>?,
    ) {
      Log.i(TAG, "unlockFlowEnd dramaId=${drama.id} status=$errCode extra=$map")
    }

    override fun showCustomAd(
      drama: DJXDrama,
      callback: IDJXDramaUnlockListener.CustomAdCallback,
    ) {
      if (pendingUnlockCallback != null) {
        callback.onError()
        return
      }
      val requestId = UUID.randomUUID().toString()
      pendingUnlockRequestId = requestId
      pendingUnlockCallback = callback
      // Pangrowth 要求 showCustomAd 返回前先报告广告流程已经接管，否则会立即
      // 以 ERROR_GET_VIDEO_AD_ERROR 结束本次解锁。此时 GroMore 尚未产生竞价
      // CPM，官方允许传空字符串；真实 CPM 仍由广告事件上报和 SSV 结算使用。
      pendingUnlockAdShown = true
      callback.onShow("")
      Log.i(TAG, "customAd onShow cpm=pending")
      heartbeatHandler.postDelayed(unlockTimeout, CUSTOM_AD_TIMEOUT_MS)
      DramaContentModule.emitUnlockAdRequest(requestId, drama.id, currentEpisodeIndex)
    }
  }

  private fun notifyCustomAdShownInternal(cpm: String): Boolean {
    val callback = pendingUnlockCallback ?: return false
    if (pendingUnlockAdShown) return true
    pendingUnlockAdShown = true
    callback.onShow(cpm)
    Log.i(TAG, "customAd onShow cpm=$cpm")
    return true
  }

  private fun completeCustomAd(success: Boolean, transactionId: String, cpm: String): Boolean {
    val callback = pendingUnlockCallback ?: return false
    if (success && !pendingUnlockAdShown) notifyCustomAdShownInternal(cpm)
    pendingUnlockCallback = null
    pendingUnlockRequestId = null
    pendingUnlockAdShown = false
    heartbeatHandler.removeCallbacks(unlockTimeout)
    if (success) {
      callback.onRewardVerify(DJXRewardAdResult(true, mapOf("transactionId" to transactionId, "cpm" to cpm)))
      Log.i(TAG, "customAd onRewardVerify success transactionId=$transactionId")
    } else {
      callback.onError()
      Log.i(TAG, "customAd onError")
    }
    return true
  }

  private fun showRewardDialog(awardedCoins: String, coinBalance: String) {
    if (isFinishing || isDestroyed) return
    val density = resources.displayMetrics.density
    fun dp(value: Int) = (value * density).toInt()
    fun text(value: String, size: Float, color: Int) = TextView(this).apply {
      this.text = value
      textSize = size
      setTextColor(color)
      gravity = Gravity.CENTER
    }
    val card = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      setPadding(dp(24), dp(26), dp(24), dp(22))
      background = GradientDrawable().apply {
        setColor(android.graphics.Color.rgb(21, 27, 38))
        setStroke(dp(1), android.graphics.Color.rgb(81, 66, 30))
        cornerRadius = dp(22).toFloat()
      }
    }
    card.addView(text("奖励已到账", 21f, android.graphics.Color.WHITE))
    card.addView(text("解锁剧集广告收益", 14f, android.graphics.Color.rgb(159, 167, 181)).apply {
      setPadding(0, dp(8), 0, 0)
    })
    val amountView = text("+0", 42f, android.graphics.Color.rgb(240, 190, 73)).apply {
      setPadding(0, dp(14), 0, 0)
    }
    card.addView(amountView)
    card.addView(text("金币", 14f, android.graphics.Color.rgb(240, 190, 73)))
    card.addView(text("当前余额 $coinBalance", 14f, android.graphics.Color.rgb(216, 221, 231)).apply {
      setPadding(0, dp(18), 0, dp(18))
    })
    val dialog = Dialog(this).apply {
      setContentView(card)
      window?.apply {
        setBackgroundDrawableResource(android.R.color.transparent)
        addFlags(android.view.WindowManager.LayoutParams.FLAG_DIM_BEHIND)
        attributes = attributes.apply { dimAmount = 0.72f }
        setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
      }
    }
    val button = text("开心收下", 16f, android.graphics.Color.rgb(27, 22, 9)).apply {
      setPadding(dp(40), dp(12), dp(40), dp(12))
      background = GradientDrawable().apply {
        setColor(android.graphics.Color.rgb(240, 190, 73))
        cornerRadius = dp(12).toFloat()
      }
      setOnClickListener { dialog.dismiss() }
    }
    card.addView(button, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    dialog.setOnShowListener {
      val target = awardedCoins.toLongOrNull()?.coerceAtLeast(0L) ?: 0L
      ValueAnimator.ofFloat(0f, 1f).apply {
        duration = 1600L
        addUpdateListener { amountView.text = "+${(target * it.animatedFraction).toLong()}" }
        start()
      }
    }
    dialog.show()
    dialog.window?.setLayout((resources.displayMetrics.widthPixels - dp(48)).coerceAtMost(dp(420)), ViewGroup.LayoutParams.WRAP_CONTENT)
  }

  companion object {
    const val EXTRA_DRAMA_ID = "hly.extra.DRAMA_ID"
    const val EXTRA_EPISODE_INDEX = "hly.extra.EPISODE_INDEX"
    const val EXTRA_UNLOCK_MODE = "hly.extra.UNLOCK_MODE"
    const val EXTRA_FREE_EPISODES = "hly.extra.FREE_EPISODES"
    const val EXTRA_UNLOCK_EPISODES = "hly.extra.UNLOCK_EPISODES"
    const val EXTRA_CONTINUOUS_UNLOCK = "hly.extra.CONTINUOUS_UNLOCK"
    const val EXTRA_HIDE_REWARD_DIALOG = "hly.extra.HIDE_REWARD_DIALOG"
    const val EXTRA_HIDE_CELLULAR_TOAST = "hly.extra.HIDE_CELLULAR_TOAST"
    const val EXTRA_HIDE_LIKE_BUTTON = "hly.extra.HIDE_LIKE_BUTTON"
    const val EXTRA_HIDE_FAVOR_BUTTON = "hly.extra.HIDE_FAVOR_BUTTON"
    const val EXTRA_HIDE_DOUBLE_CLICK = "hly.extra.HIDE_DOUBLE_CLICK"
    const val EXTRA_HIDE_LONG_CLICK_SPEED = "hly.extra.HIDE_LONG_CLICK_SPEED"
    const val EXTRA_INFINITE_SCROLL = "hly.extra.INFINITE_SCROLL"
    @Volatile private var activeActivity: WeakReference<DramaPlayerActivity>? = null
    private const val TAG = "DramaPlayerActivity"
    private const val FRAGMENT_TAG = "pangrowth_drama_detail"
    private const val EVENT_REQUEST_SUCCEEDED = "REQUEST_SUCCEEDED"
    private const val EVENT_PLAYBACK_STARTED = "PLAYBACK_STARTED"
    private const val EVENT_WATCH_PROGRESS = "WATCH_PROGRESS"
    private const val EVENT_PLAYER_CLOSED = "PLAYER_CLOSED"
    private const val HEARTBEAT_INTERVAL_MS = 15_000L
    private const val MIN_REPORT_SECONDS = 5
    private const val DEFAULT_FREE_EPISODES = 10
    private const val DEFAULT_UNLOCK_EPISODES = 10
    private const val MAX_UNLOCK_EPISODES = 10
    private const val CUSTOM_AD_TIMEOUT_MS = 10 * 60_000L

    fun notifyCustomAdShown(requestId: String, cpm: String): Boolean {
      val activity = activeActivity?.get() ?: return false
      if (activity.pendingUnlockRequestId != requestId) return false
      activity.runOnUiThread { activity.notifyCustomAdShownInternal(cpm) }
      return true
    }

    fun resolveCustomAd(requestId: String, success: Boolean, transactionId: String, cpm: String): Boolean {
      val activity = activeActivity?.get() ?: return false
      if (activity.pendingUnlockRequestId != requestId) return false
      activity.runOnUiThread { activity.completeCustomAd(success, transactionId, cpm) }
      return true
    }

    fun showRewardReceipt(awardedCoins: String, coinBalance: String): Boolean {
      val activity = activeActivity?.get() ?: return false
      activity.runOnUiThread { activity.showRewardDialog(awardedCoins, coinBalance) }
      return true
    }
  }
}
