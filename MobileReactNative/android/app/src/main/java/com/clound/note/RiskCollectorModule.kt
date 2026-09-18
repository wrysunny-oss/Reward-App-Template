package com.clound.note

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.os.CancellationSignal
import android.os.Debug
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.WritableNativeMap
import java.io.File
import java.net.NetworkInterface
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Android 设备风控信号采集器。
 *
 * 这里只采集客观设备信号，不在客户端计算分数或执行封号。每项检测都独立降级为
 * UNKNOWN，权限被拒绝、厂商 API 异常等情况不会被误判为风险；最终规则由服务端统一执行。
 */
class RiskCollectorModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context) {

  override fun getName() = "RiskCollector"

  /**
   * 登录后、观看激励广告前或提现前调用。nonce 由服务端一次性挑战签发，服务端会
   * 核验 evidence.challengeNonce，防止历史采集包被直接重放。
   */
  @ReactMethod
  fun collect(nonce: String, promise: Promise) {
    try {
      currentLocation { location ->
        try {
          promise.resolve(buildResult(nonce, location))
        } catch (error: Throwable) {
          promise.reject("RISK_COLLECT_FAILED", error.message, error)
        }
      }
    } catch (error: Throwable) {
      promise.reject("RISK_COLLECT_FAILED", error.message, error)
    }
  }

  /** 前台活跃心跳只采集设备安装标识和当前位置，避免每五分钟生成完整风控快照。 */
  @ReactMethod
  fun collectLocation(promise: Promise) {
    try {
      currentLocation { location ->
        val result = WritableNativeMap().apply {
          putString("deviceId", stableDeviceId())
          if (location != null) putMap("location", locationMap(location))
        }
        promise.resolve(result)
      }
    } catch (error: Throwable) {
      promise.reject("RISK_LOCATION_FAILED", error.message, error)
    }
  }

  /** 所有信号仍在一次挑战内提交，位置为空时服务端会将附近设备项记为 UNKNOWN。 */
  private fun buildResult(nonce: String, location: Location?): WritableMap = WritableNativeMap().apply {
    putString("deviceId", stableDeviceId())
    putString("simStatus", simStatus())
    putString("wechatStatus", installed("com.tencent.mm"))
    putString("douyinStatus", installed("com.ss.android.ugc.aweme"))
    putString("alipayStatus", installed("com.eg.android.AlipayGphone"))
    putString("emulatorStatus", emulatorStatus())
    putString("cloudDeviceStatus", cloudDeviceStatus())
    putString("scriptStatus", scriptStatus())
    putString("networkStatus", networkStatus())
    // 公网 IP 只能由服务端从连接信息中可信获取，客户端固定返回 UNKNOWN。
    putString("ipStatus", "UNKNOWN")
    if (location != null) putMap("location", locationMap(location))
    putMap("evidence", evidence(nonce, location))
  }

  /** Android ID 在 Android 8+ 按签名和用户隔离；哈希后只用于本应用关联设备。 */
  private fun stableDeviceId(): String {
    val androidId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
      .orEmpty()
    val source = "${context.packageName}:$androidId:${Build.BRAND}:${Build.DEVICE}"
    return MessageDigest.getInstance("SHA-256")
      .digest(source.toByteArray(Charsets.UTF_8))
      .joinToString("") { "%02x".format(it) }
  }

  /** 查询结果仅表达是否安装；Android 11+ 所需包名已在 manifest queries 中声明。 */
  private fun installed(packageName: String): String = try {
    context.packageManager.getPackageInfo(packageName, 0)
    "PASS"
  } catch (_: PackageManager.NameNotFoundException) {
    "RISK"
  } catch (_: Throwable) {
    "UNKNOWN"
  }

  /** 未取得电话权限时不推断 SIM 状态，避免把用户拒绝权限当成风险。 */
  private fun simStatus(): String {
    return try {
      if (context.checkSelfPermission(Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) {
        "UNKNOWN"
      } else {
        val manager = context.getSystemService(Context.TELEPHONY_SERVICE) as? android.telephony.TelephonyManager
          ?: return "UNKNOWN"
        when (manager.simState) {
          android.telephony.TelephonyManager.SIM_STATE_READY -> "PASS"
          android.telephony.TelephonyManager.SIM_STATE_UNKNOWN -> "UNKNOWN"
          else -> "RISK"
        }
      }
    } catch (_: Throwable) {
      "UNKNOWN"
    }
  }

  /** 综合 Build、硬件和 QEMU 常见标记，降低只判断单个 MODEL 带来的漏报。 */
  private fun emulatorStatus(): String {
    val value = listOf(
      Build.FINGERPRINT, Build.MODEL, Build.PRODUCT, Build.HARDWARE,
      Build.BRAND, Build.DEVICE, Build.MANUFACTURER,
    ).joinToString(" ").lowercase()
    val markers = listOf(
      "generic", "google_sdk", "emulator", "android sdk built for",
      "goldfish", "ranchu", "vbox", "sdk_gphone", "qemu",
    )
    return if (markers.any(value::contains)) "RISK" else "PASS"
  }

  /** 云手机厂商及常见虚拟容器标记；无法确定时不根据普通国产机品牌作推断。 */
  private fun cloudDeviceStatus(): String {
    val value = "${Build.BRAND} ${Build.MANUFACTURER} ${Build.MODEL} ${Build.PRODUCT}".lowercase()
    val markers = listOf("redfinger", "cloudphone", "cloud phone", "vmos", "x8 sandbox", "arm cloud")
    return if (markers.any(value::contains)) "RISK" else "PASS"
  }

  /** 检测实时调试器、Root/Magisk 文件、Hook 管理器以及当前进程已加载的 Hook 库。 */
  private fun scriptStatus(): String {
    return try {
      if (Debug.isDebuggerConnected() || Debug.waitingForDebugger()) return "RISK"
      val suspiciousFiles = listOf(
        "/system/bin/su", "/system/xbin/su", "/sbin/su", "/su/bin/su",
        "/data/adb/magisk", "/data/local/tmp/frida-server",
      )
      if (suspiciousFiles.any { File(it).exists() }) return "RISK"
      val hookPackages = listOf(
        "org.lsposed.manager", "org.meowcat.edxposed.manager",
        "de.robv.android.xposed.installer", "com.topjohnwu.magisk",
      )
      if (hookPackages.any { installed(it) == "PASS" }) return "RISK"
      val maps = runCatching { File("/proc/self/maps").readText() }.getOrDefault("").lowercase()
      if (listOf("frida", "xposed", "substrate", "zygisk").any(maps::contains)) "RISK" else "PASS"
    } catch (_: Throwable) {
      "UNKNOWN"
    }
  }

  /** VPN、系统代理视为风险；无有效互联网能力时返回 UNKNOWN，不直接扣分。 */
  private fun networkStatus(): String {
    return try {
      val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        ?: return "UNKNOWN"
      val capabilities = manager.getNetworkCapabilities(manager.activeNetwork) ?: return "UNKNOWN"
      val hasVpn = capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN) ||
        NetworkInterface.getNetworkInterfaces()?.toList().orEmpty().any {
          it.isUp && (it.name.startsWith("tun") || it.name.startsWith("ppp"))
        }
      val hasProxy = !System.getProperty("http.proxyHost").isNullOrBlank() ||
        !System.getProperty("https.proxyHost").isNullOrBlank()
      when {
        hasVpn || hasProxy -> "RISK"
        capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) -> "PASS"
        else -> "UNKNOWN"
      }
    } catch (_: Throwable) {
      "UNKNOWN"
    }
  }

  /** 使用系统已有的最后位置作为单次定位超时后的回退，不在后台持续监听。 */
  @SuppressLint("MissingPermission")
  private fun lastKnownLocation(): Location? {
    return try {
      val fine = context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
      val coarse = context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
      if (!fine && !coarse) return null
      val manager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return null
      manager.getProviders(true)
        .mapNotNull { provider -> runCatching { manager.getLastKnownLocation(provider) }.getOrNull() }
        .maxWithOrNull(compareBy<Location> { it.time }.thenBy { -it.accuracy })
    } catch (_: Throwable) {
      null
    }
  }

  /**
   * Android 11+ 请求一次前台当前位置，最多等待 5 秒；超时或旧系统回退到缓存位置。
   * 缓存位置是否足够新由服务端再次校验，过旧只会得到 UNKNOWN，不会扣分。
   */
  @SuppressLint("MissingPermission")
  private fun currentLocation(callback: (Location?) -> Unit) {
    val fine = context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
    val coarse = context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
    if (!fine && !coarse) return callback(null)
    val manager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return callback(null)
    val fallback = lastKnownLocation()
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return callback(fallback)
    val provider = when {
      manager.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
      manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
      else -> manager.getProviders(true).firstOrNull()
    } ?: return callback(fallback)
    val completed = AtomicBoolean(false)
    val handler = Handler(Looper.getMainLooper())
    val cancellation = CancellationSignal()
    val timeout = Runnable {
      if (completed.compareAndSet(false, true)) {
        cancellation.cancel()
        callback(fallback)
      }
    }
    handler.postDelayed(timeout, 5_000)
    try {
      manager.getCurrentLocation(provider, cancellation, context.mainExecutor) { location ->
        if (completed.compareAndSet(false, true)) {
          handler.removeCallbacks(timeout)
          callback(location ?: fallback)
        }
      }
    } catch (_: Throwable) {
      handler.removeCallbacks(timeout)
      if (completed.compareAndSet(false, true)) callback(fallback)
    }
  }

  private fun locationMap(location: Location): WritableMap = WritableNativeMap().apply {
    putDouble("latitude", location.latitude)
    putDouble("longitude", location.longitude)
    putDouble("accuracyMeters", location.accuracy.toDouble())
    putDouble("capturedAt", location.time.toDouble())
    @Suppress("DEPRECATION")
    putBoolean("isMock", if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) location.isMock else location.isFromMockProvider)
  }

  /** 证据字段用于后台审计和问题定位，不包含原始 Android ID。 */
  private fun evidence(nonce: String, location: Location?): WritableMap = WritableNativeMap().apply {
    putString("challengeNonce", nonce)
    putString("collectorVersion", "3.1.0-rn")
    putString("platform", "android")
    putInt("sdkInt", Build.VERSION.SDK_INT)
    putString("manufacturer", Build.MANUFACTURER)
    putString("model", Build.MODEL)
    putString("brand", Build.BRAND)
    putString("product", Build.PRODUCT)
    putString("hardware", Build.HARDWARE)
    putString("fingerprint", Build.FINGERPRINT.take(300))
    putString("supportedAbis", Build.SUPPORTED_ABIS.joinToString(","))
    putBoolean("debuggable", context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0)
    putBoolean("phonePermission", context.checkSelfPermission(Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED)
    putBoolean("locationPermission", context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED)
    if (location != null) putString("locationProvider", location.provider ?: "unknown")
  }
}
