'use strict';

/**
 * 对 react-native-playnest-unionad@1.0.0 的项目级兼容补丁。
 *
 * 补丁目标：
 * 1. RN 0.84 + GroMore 7.7.1.6 下保持可重复初始化；
 * 2. 仅允许 ARM 进程初始化 SDK，避免 fat APK 在 x86 进程中加载 ARM so 而闪退；
 * 3. 将 GroMore trans_id 透传到 TypeScript，供服务端验奖追踪；
 * 4. 补齐播放错误、播放完成和广告对象销毁事件。
 *
 * 所有替换均为幂等操作；上游升级后若源码结构变化会明确报错，避免静默失效。
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function patch(relativePath, transform) {
  const filename = path.join(root, relativePath);
  if (!fs.existsSync(filename)) {
    throw new Error(`[playnest patch] 找不到文件：${relativePath}`);
  }
  const before = fs.readFileSync(filename, 'utf8');
  const after = transform(before.replace(/\r\n/g, '\n'));
  if (after !== before.replace(/\r\n/g, '\n')) {
    fs.writeFileSync(filename, after, 'utf8');
    console.log(`[postinstall] 已修补 ${relativePath}`);
  }
}

function replaceRequired(source, search, replacement, marker) {
  if (source.includes(marker)) return source;
  if (!source.includes(search)) {
    throw new Error(`[playnest patch] 上游源码已变化，无法应用补丁：${marker}`);
  }
  return source.replace(search, replacement);
}

const managerPath =
  'node_modules/react-native-playnest-unionad/android/src/main/java/com/playnestunionad/PangleSdkManager.kt';
patch(managerPath, source => {
  let next = replaceRequired(
    source,
    'import android.content.Context\n',
    'import android.content.Context\nimport android.os.Build\n',
    'import android.os.Build',
  );
  next = replaceRequired(
    next,
    '    ) {\n        val mediationBuilder = MediationConfig.Builder()',
    `    ) {
        // 当前 APK 同时包含 RN 的 x86 与 ARM 库，但 GroMore 的关键 so 仅有 ARM。
        // Android 会按首选 ABI 选择进程架构；只看列表中“是否包含 ARM”会误放行
        // x86 进程，随后在 SDK 后台线程触发无法被 try/catch 捕获的 native 崩溃。
        val processAbi = Build.SUPPORTED_ABIS.firstOrNull().orEmpty()
        if (processAbi != "arm64-v8a" && processAbi != "armeabi-v7a") {
            callback.fail(
                -70001,
                "GroMore 仅支持 ARM 进程，当前首选 ABI: $processAbi",
            )
            return
        }
        // SDK 官方只允许初始化一次。React 页面重建时直接复用既有实例。
        if (isInit || TTAdSdk.isInitSuccess()) {
            isInit = true
            callback.success()
            return
        }
        val mediationBuilder = MediationConfig.Builder()`,
    'val processAbi = Build.SUPPORTED_ABIS.firstOrNull()',
  );
  return next;
});

const modulePath =
  'node_modules/react-native-playnest-unionad/android/src/main/java/com/playnestunionad/PlaynestUnionadModule.kt';
patch(modulePath, source => {
  let next = replaceRequired(
    source,
    `    if (appId.isNullOrBlank()) {
      promise.resolve(false)
      return
    }`,
    `    if (appId.isNullOrBlank()) {
      promise.reject("PANGLE_APP_ID_EMPTY", "GroMore Android App ID 不能为空")
      return
    }`,
    'PANGLE_APP_ID_EMPTY',
  );
  next = replaceRequired(
    next,
    `          override fun fail(code: Int, msg: String?) {
            promise.resolve(false)
          }`,
    `          override fun fail(code: Int, msg: String?) {
            promise.reject(
              "PANGLE_INIT_FAILED",
              "GroMore 初始化失败 code=$code msg=\${msg ?: "unknown"}",
            )
          }`,
    '"PANGLE_INIT_FAILED"',
  );
  return next;
});

const rewardPath =
  'node_modules/react-native-playnest-unionad/android/src/main/java/com/playnestunionad/RewardVideoAd.kt';
patch(rewardPath, source => {
  let next = replaceRequired(
    source,
    'putString("ecpm", EcpmUtil.toJson(mttRewardVideoAd?.mediationManager?.showEcpm))',
    'putString("ecpm", EcpmUtil.toJson(ad.mediationManager?.showEcpm))',
    'EcpmUtil.toJson(ad.mediationManager',
  );
  next = replaceRequired(
    next,
    `            override fun onAdClose() {
                event("onClose")
            }

            override fun onVideoError() {}

            override fun onVideoComplete() {}`,
    `            override fun onAdClose() {
                event("onClose")
                ad.mediationManager?.destroy()
                mttRewardVideoAd = null
                emit = null
            }

            override fun onVideoError() {
                event("onFail") { putString("error", "激励视频播放失败") }
            }

            override fun onVideoComplete() {
                event("onFinish")
            }`,
    '激励视频播放失败',
  );
  next = replaceRequired(
    next,
    '                    putString("error", extraInfo.getString("reward_extra_key_error_msg"))',
    `                    putString("error", extraInfo.getString(MediationConstant.KEY_ERROR_MSG))
                    putString("transactionId", extraInfo.getString(MediationConstant.KEY_TRANS_ID))`,
    'putString("transactionId"',
  );
  next = replaceRequired(
    next,
    `                val amount = when (val v = extraInfo["reward_extra_key_reward_amount"]) {
                    is Int -> v
                    is Float -> v.toInt()
                    is Number -> v.toInt()
                    else -> 0
                }
                event("onRewardArrived") {
                    putBoolean("rewardVerify", isRewardValid)
                    putInt("rewardType", rewardType)
                    putInt("rewardAmount", amount)
                    putString("rewardName", extraInfo.getString("reward_extra_key_reward_name"))
                    putString("propose", extraInfo["reward_extra_key_reward_propose"]?.toString())
                    putInt("errorCode", extraInfo.getInt("reward_extra_key_error_code"))
                    putString("error", extraInfo.getString(MediationConstant.KEY_ERROR_MSG))
                    putString("transactionId", extraInfo.getString(MediationConstant.KEY_TRANS_ID))
                }`,
    `                val amount = when (val v = extraInfo["reward_extra_key_reward_amount"]) {
                    is Int -> v
                    is Float -> v.toInt()
                    is Number -> v.toInt()
                    is String -> v.toDoubleOrNull()?.toInt() ?: 0
                    else -> 0
                }
                val rewardNameValue = extraInfo["reward_extra_key_reward_name"]?.toString().orEmpty()
                val errorCodeValue = when (val v = extraInfo["reward_extra_key_error_code"]) {
                    is Number -> v.toInt()
                    is String -> v.toIntOrNull() ?: 0
                    else -> 0
                }
                val errorValue = extraInfo[MediationConstant.KEY_ERROR_MSG]?.toString().orEmpty()
                val transactionIdValue = extraInfo[MediationConstant.KEY_TRANS_ID]?.toString().orEmpty()
                Log.i(TAG, "onRewardArrived bridge valid=$isRewardValid type=$rewardType transactionId=$transactionIdValue")
                event("onRewardArrived") {
                    putBoolean("rewardVerify", isRewardValid)
                    putInt("rewardType", rewardType)
                    putInt("rewardAmount", amount)
                    putString("rewardName", rewardNameValue)
                    putString("propose", extraInfo["reward_extra_key_reward_propose"]?.toString())
                    putInt("errorCode", errorCodeValue)
                    putString("error", errorValue)
                    putString("transactionId", transactionIdValue)
                }`,
    'onRewardArrived bridge valid=',
  );
  return next;
});

patch(
  'node_modules/react-native-playnest-unionad/android/src/main/java/com/playnestunionad/EcpmUtil.kt',
  source => replaceRequired(
    source,
    '        obj.put("ecpm", info.ecpm)\n',
    '        obj.put("ecpm", info.ecpm)\n        obj.put("rsInfo", info.customData?.get("rs_info"))\n',
    'info.customData?.get("rs_info")',
  ),
);

patch(
  'node_modules/react-native-playnest-unionad/src/index.tsx',
  source => replaceRequired(
    source,
    '  ecpm?: string;\n  biddingType?: number;\n',
    '  ecpm?: string;\n  /** 穿山甲加密 eCPM 凭证，只传给服务端验真。 */\n  rsInfo?: string;\n  biddingType?: number;\n',
    'rsInfo?: string',
  ),
);

patch(
  'node_modules/react-native-playnest-unionad/lib/typescript/src/index.d.ts',
  source => replaceRequired(
    source,
    '    ecpm?: string;\n    biddingType?: number;\n',
    '    ecpm?: string;\n    /** 穿山甲加密 eCPM 凭证，只传给服务端验真。 */\n    rsInfo?: string;\n    biddingType?: number;\n',
    'rsInfo?: string',
  ),
);

patch(
  'node_modules/react-native-playnest-unionad/src/NativePlaynestUnionad.ts',
  source => replaceRequired(
    source,
    '  propose?: string;\n',
    '  propose?: string;\n  /** GroMore 服务端验奖交易 ID */\n  transactionId?: string;\n',
    'transactionId?: string',
  ),
);

patch('node_modules/react-native-playnest-unionad/src/index.tsx', source => {
  let next = replaceRequired(
    source,
    '  propose?: string;\n}',
    '  propose?: string;\n  /** GroMore 服务端验奖交易 ID */\n  transactionId?: string;\n}',
    'transactionId?: string',
  );
  if (!next.includes('transactionId: e.transactionId')) {
    next = next.replace(
      '    propose: e.propose,\n',
      '    propose: e.propose,\n    transactionId: e.transactionId,\n',
    );
  }
  next = replaceRequired(
    next,
    '  /** 跳过视频 */\n  onSkip?: () => void;\n  /** 奖励验证（旧版回调） */',
    '  /** 跳过视频 */\n  onSkip?: () => void;\n  /** 视频播放完成 */\n  onFinish?: () => void;\n  /** 奖励验证（旧版回调） */',
    '视频播放完成 */\n  onFinish?: () => void;\n  /** 奖励验证',
  );
  if (!next.includes("case 'onFinish':\n      cb.onFinish?.();\n      break;\n    case 'onVerify':")) {
    next = replaceRequired(
      next,
      "    case 'onSkip':\n      cb.onSkip?.();\n      break;\n    case 'onVerify':",
      "    case 'onSkip':\n      cb.onSkip?.();\n      break;\n    case 'onFinish':\n      cb.onFinish?.();\n      break;\n    case 'onVerify':",
      "case 'onFinish':\n      cb.onFinish?.();\n      break;\n    case 'onVerify':",
    );
  }
  return next;
});

patch('node_modules/react-native-playnest-unionad/lib/module/index.js', source => {
  let next = source.includes('transactionId: e.transactionId')
    ? source
    : source.replace(
        '    propose: e.propose\n',
        '    propose: e.propose,\n    transactionId: e.transactionId\n',
      );
  if (!next.includes("case 'onFinish':\n      cb.onFinish?.();\n      break;\n    case 'onVerify':")) {
    next = replaceRequired(
      next,
      "    case 'onSkip':\n      cb.onSkip?.();\n      break;\n    case 'onVerify':",
      "    case 'onSkip':\n      cb.onSkip?.();\n      break;\n    case 'onFinish':\n      cb.onFinish?.();\n      break;\n    case 'onVerify':",
      "case 'onFinish':\n      cb.onFinish?.();\n      break;\n    case 'onVerify':",
    );
  }
  return next;
});

patch(
  'node_modules/react-native-playnest-unionad/lib/typescript/src/index.d.ts',
  source => {
    let next = replaceRequired(
      source,
      '    propose?: string;\n}',
      '    propose?: string;\n    /** GroMore 服务端验奖交易 ID */\n    transactionId?: string;\n}',
      'transactionId?: string',
    );
    next = replaceRequired(
      next,
      '    /** 跳过视频 */\n    onSkip?: () => void;\n    /** 奖励验证（旧版回调） */',
      '    /** 跳过视频 */\n    onSkip?: () => void;\n    /** 视频播放完成 */\n    onFinish?: () => void;\n    /** 奖励验证（旧版回调） */',
      '视频播放完成 */\n    onFinish?: () => void;\n    /** 奖励验证',
    );
    return next;
  },
);
