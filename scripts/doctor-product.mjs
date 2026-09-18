import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  normalizeAndValidateProductConfig,
  readProductConfig,
} from './product-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const findings = [];
const options = parseArguments(process.argv.slice(2));

function parseArguments(argv) {
  const parsed = { production: false, live: false, json: false, envFile: '', deployEnvFile: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--production') parsed.production = true;
    else if (argument === '--live') parsed.live = true;
    else if (argument === '--json') parsed.json = true;
    else if (argument === '--help' || argument === '-h') parsed.help = true;
    else if (argument.startsWith('--env-file=')) parsed.envFile = argument.slice('--env-file='.length);
    else if (argument.startsWith('--deploy-env-file=')) parsed.deployEnvFile = argument.slice('--deploy-env-file='.length);
    else throw new Error(`未知参数：${argument}`);
  }
  return parsed;
}

function usage() {
  console.log(`
产品与部署体检

用法：
  npm run product:doctor
  npm run product:doctor -- --production
  npm run product:doctor -- --production --live

参数：
  --production                 严格检查生产部署文件与配置
  --live                       请求线上 /ready 和 /download
  --env-file=<路径>            指定 Backend 环境变量文件
  --deploy-env-file=<路径>     指定 Docker Compose 环境变量文件
  --json                       输出 JSON，适合 CI
  --help                       查看帮助
`);
}

function add(level, code, message, hint) {
  findings.push({ level, code, message, ...(hint ? { hint } : {}) });
}

function pass(code, message) {
  add('pass', code, message);
}

function warn(code, message, hint) {
  add('warning', code, message, hint);
}

function fail(code, message, hint) {
  add('error', code, message, hint);
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function resolveInputPath(value, fallback) {
  const selected = value || fallback;
  return path.isAbsolute(selected) ? selected : path.join(root, selected);
}

function parseEnvFile(file) {
  const values = {};
  for (const sourceLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line || line.startsWith('#')) continue;
    const equalIndex = line.indexOf('=');
    if (equalIndex <= 0) continue;
    const key = line.slice(0, equalIndex).trim();
    let value = line.slice(equalIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function isPlaceholder(value) {
  if (!value) return true;
  return /(replace([_-]?with)?|change[_-]?me|example|your[_-]|password|x{4,}|填入|请替换|replace_me)/i.test(value);
}

function checkSecret(env, key, minimumLength, required = true) {
  const value = env[key]?.trim();
  if (!value) {
    if (required) fail(`env.${key}`, `${key} 未配置`);
    else warn(`env.${key}`, `${key} 未配置`);
    return;
  }
  if (value.length < minimumLength || isPlaceholder(value)) {
    fail(`env.${key}`, `${key} 仍是示例值或长度不足`);
    return;
  }
  pass(`env.${key}`, `${key} 已配置`);
}

function checkPlainValue(env, key, required = true) {
  const value = env[key]?.trim();
  if (!value || isPlaceholder(value)) {
    const report = required ? fail : warn;
    report(`env.${key}`, `${key} 未配置或仍是示例值`);
    return false;
  }
  pass(`env.${key}`, `${key} 已配置`);
  return true;
}

function stableJson(value) {
  return JSON.stringify(value);
}

function checkGeneratedProduct(product) {
  const mobilePath = path.join(root, 'MobileReactNative', 'product.generated.json');
  if (!fs.existsSync(mobilePath)) {
    fail('generated.mobile', 'APP 产品配置生成文件不存在', '运行 npm run product:sync');
  } else {
    const mobile = JSON.parse(fs.readFileSync(mobilePath, 'utf8'));
    stableJson(mobile) === stableJson(product)
      ? pass('generated.mobile', 'APP 产品配置与源配置一致')
      : fail('generated.mobile', 'APP 产品配置已经过期', '运行 npm run product:sync');
  }

  const expectedSource = `export const productConfig = ${JSON.stringify(product, null, 2)} as const;`;
  for (const [code, relativePath, label] of [
    ['generated.backend', 'Backend/src/generated/product.generated.ts', 'Backend'],
    ['generated.admin', 'Admin/apps/web-naive/src/config/product.generated.ts', 'Admin'],
  ]) {
    const file = path.join(root, relativePath);
    if (!fs.existsSync(file)) fail(code, `${label} 产品配置生成文件不存在`, '运行 npm run product:sync');
    else if (!fs.readFileSync(file, 'utf8').includes(expectedSource)) fail(code, `${label} 产品配置已经过期`, '运行 npm run product:sync');
    else pass(code, `${label} 产品配置与源配置一致`);
  }

  const appJson = JSON.parse(fs.readFileSync(path.join(root, 'MobileReactNative', 'app.json'), 'utf8'));
  appJson.displayName === product.brand.appDisplayName
    ? pass('generated.app-name', 'APP 原生显示名称已同步')
    : fail('generated.app-name', 'APP 原生显示名称未同步', '运行 npm run product:sync');

  const adminProduction = parseEnvFile(path.join(root, 'Admin', 'apps', 'web-naive', '.env.production'));
  const expectedApi = `${product.domains.productionApiOrigin}/api/v1`;
  adminProduction.VITE_GLOB_API_URL === expectedApi
    ? pass('generated.admin-api', 'Admin 生产 API 地址正确')
    : fail('generated.admin-api', `Admin 生产 API 地址应为 ${expectedApi}`, '运行 npm run product:sync');
}

function selectRuntimeEnv() {
  const fallback = options.production
    ? 'deploy/backend.env'
    : exists('deploy/backend.env')
      ? 'deploy/backend.env'
      : 'Backend/.env';
  const file = resolveInputPath(options.envFile, fallback);
  if (!fs.existsSync(file)) {
    const message = `未找到 Backend 环境变量文件：${path.relative(root, file)}`;
    options.production ? fail('env.file', message, '从 deploy/backend.env.example 复制并填写') : warn('env.file', message);
    return { file, values: null };
  }
  pass('env.file', `已读取 Backend 环境变量文件：${path.relative(root, file)}`);
  return { file, values: parseEnvFile(file) };
}

function checkRuntimeEnv(env, product, deployEnv) {
  if (!env) return;
  if (options.production) {
    env.NODE_ENV === 'production' ? pass('env.node', 'NODE_ENV=production') : fail('env.node', '生产环境必须设置 NODE_ENV=production');
    env.API_DOCS_ENABLED === 'false' ? pass('env.docs', '生产环境接口文档已关闭') : fail('env.docs', '生产环境必须设置 API_DOCS_ENABLED=false');
  } else {
    pass('env.mode', `当前环境模式：${env.NODE_ENV || 'development'}`);
  }

  checkSecret(env, 'JWT_ACCESS_SECRET', 32);
  checkSecret(env, 'JWT_REFRESH_SECRET', 32);
  if (product.modules.withdrawals) checkSecret(env, 'WITHDRAW_DATA_SECRET', 32);

  const cors = (env.CORS_ORIGINS || '').split(',').map((item) => item.trim()).filter(Boolean);
  if (!cors.length) fail('env.cors', 'CORS_ORIGINS 不能为空');
  else if (options.production && cors.some((origin) => origin === '*' || !origin.startsWith('https://') || /localhost|127\.0\.0\.1/.test(origin))) {
    fail('env.cors', '生产 CORS_ORIGINS 只能包含明确的 HTTPS 管理端域名');
  } else pass('env.cors', `CORS 白名单包含 ${cors.length} 个来源`);

  if (product.modules.advertising) {
    checkSecret(env, 'PANGLE_CALLBACK_SECRET', 32, options.production);
    checkSecret(env, 'PANGLE_REWARD_SECURITY_KEY', 16);
    checkSecret(env, 'PANGLE_RSS_PRIVATE_KEY', 32, false);
    if (!env.PANGLE_GROMORE_APP_ID) {
      const report = options.production ? fail : warn;
      report('env.pangle-app', 'PANGLE_GROMORE_APP_ID 未显式配置', '生产环境应与 product.config.json 保持一致');
    } else if (env.PANGLE_GROMORE_APP_ID === product.advertising.gromore.appId) {
      pass('env.pangle-app', '服务端 GroMore 应用 ID 与产品配置一致');
    } else fail('env.pangle-app', 'PANGLE_GROMORE_APP_ID 与 product.config.json 不一致');
    if (!env.PANGLE_GROMORE_REWARDED_PLACEMENT_ID) {
      const report = options.production ? fail : warn;
      report('env.pangle-reward', 'PANGLE_GROMORE_REWARDED_PLACEMENT_ID 未显式配置', '生产环境应与 product.config.json 保持一致');
    } else if (env.PANGLE_GROMORE_REWARDED_PLACEMENT_ID === product.advertising.gromore.rewardPlacementId) {
      pass('env.pangle-reward', '服务端激励广告位 ID 与产品配置一致');
    } else fail('env.pangle-reward', 'PANGLE_GROMORE_REWARDED_PLACEMENT_ID 与 product.config.json 不一致');
    if (!env.PANGLE_CALLBACK_IPS?.trim()) warn('env.pangle-ips', 'PANGLE_CALLBACK_IPS 为空，回调只依赖签名校验', '确认这是有意配置');
  }

  if (product.modules.shortDrama) checkSecret(env, 'PANGLE_CONTENT_SERVER_KEY', 16, false);

  if (product.modules.smsRegistration) {
    checkSecret(env, 'ALIBABA_CLOUD_ACCESS_KEY_ID', 8);
    checkSecret(env, 'ALIBABA_CLOUD_ACCESS_KEY_SECRET', 16);
    checkPlainValue(env, 'ALIYUN_SMS_SIGN_NAME');
    const templateReady = checkPlainValue(env, 'ALIYUN_SMS_REGISTER_TEMPLATE_CODE');
    if (templateReady && !/^SMS_\d+$/.test(env.ALIYUN_SMS_REGISTER_TEMPLATE_CODE)) {
      fail('env.sms-template-format', '短信模板编号格式应为 SMS_数字');
    }
  }

  if (product.modules.alipayPayout) {
    checkPlainValue(env, 'ALIPAY_APP_ID');
    checkSecret(env, 'ALIPAY_PRIVATE_KEY', 64);
    checkPlainValue(env, 'ALIPAY_TRANSFER_SCENE_NAME');
    const certificateKeys = ['ALIPAY_APP_CERT_PATH', 'ALIPAY_PUBLIC_CERT_PATH', 'ALIPAY_ROOT_CERT_PATH'];
    const certificateMode = certificateKeys.every((key) => Boolean(env[key]?.trim()) && !isPlaceholder(env[key]));
    const publicKeyMode = Boolean(env.ALIPAY_PUBLIC_KEY?.trim()) && !isPlaceholder(env.ALIPAY_PUBLIC_KEY);
    if (certificateMode || publicKeyMode) pass('env.alipay-verification', `支付宝验签采用${certificateMode ? '证书' : '公钥'}模式`);
    else fail('env.alipay-verification', '支付宝证书路径或支付宝公钥未完整配置');
    if (options.production && certificateMode && deployEnv?.CERT_ROOT) {
      const missingCertificates = certificateKeys
        .map((key) => path.join(deployEnv.CERT_ROOT, path.basename(env[key])))
        .filter((file) => !fs.existsSync(file));
      missingCertificates.length
        ? fail('env.alipay-cert-files', `服务器缺少 ${missingCertificates.length} 个支付宝证书文件`, missingCertificates.join(', '))
        : pass('env.alipay-cert-files', '支付宝证书文件均存在');
    }
  }

  if (env.APP_BRAND_NAME && env.APP_BRAND_NAME !== product.brand.appDisplayName) {
    fail('env.brand', 'APP_BRAND_NAME 与 product.config.json 不一致');
  } else pass('env.brand', 'Backend 品牌名称一致');
}

function checkDeployEnv() {
  const file = resolveInputPath(options.deployEnvFile, 'deploy/.env');
  if (!fs.existsSync(file)) {
    const message = `未找到 Docker 环境变量文件：${path.relative(root, file)}`;
    options.production ? fail('deploy.env', message, '从 deploy/.env.example 复制并填写') : warn('deploy.env', message);
    return null;
  }
  const env = parseEnvFile(file);
  pass('deploy.env', `已读取 Docker 环境变量文件：${path.relative(root, file)}`);
  for (const key of ['MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_ROOT_PASSWORD']) {
    if (!env[key] || isPlaceholder(env[key]) || (key.includes('PASSWORD') && env[key].length < 16)) {
      fail(`deploy.${key}`, `${key} 未配置、仍是示例值或长度不足`);
    } else pass(`deploy.${key}`, `${key} 已配置`);
  }
  if (!env.DATA_ROOT || isPlaceholder(env.DATA_ROOT)) warn('deploy.data-root', 'DATA_ROOT 未明确配置，将使用 Compose 默认目录');
  else pass('deploy.data-root', '数据库与上传目录已配置持久化根目录');
  return env;
}

function checkAndroid(product) {
  const appRoot = path.join(root, 'MobileReactNative', 'android', 'app');
  const gradle = fs.readFileSync(path.join(appRoot, 'build.gradle'), 'utf8');
  const versionCode = Number(gradle.match(/versionCode\s+(\d+)/)?.[1]);
  const versionName = gradle.match(/versionName\s+"([^"]+)"/)?.[1];
  if (versionCode > 0 && versionName) pass('android.version', `Android 版本：${versionName} (${versionCode})`);
  else fail('android.version', '无法识别 Android versionCode/versionName');
  if (options.production && versionCode <= 1) warn('android.version-initial', 'versionCode 仍为 1，发布迭代前需要递增');

  const defaultKeystore = path.join(root, 'my-release-key.keystore');
  const configuredKeystore = process.env.HLY_RELEASE_STORE_FILE
    ? path.resolve(root, process.env.HLY_RELEASE_STORE_FILE)
    : defaultKeystore;
  fs.existsSync(configuredKeystore)
    ? pass('android.keystore', `签名证书存在：${path.relative(root, configuredKeystore)}`)
    : fail('android.keystore', '未找到 Release 签名证书');
  const signingVariables = ['HLY_RELEASE_STORE_PASSWORD', 'HLY_RELEASE_KEY_ALIAS', 'HLY_RELEASE_KEY_PASSWORD'];
  if (signingVariables.every((key) => Boolean(process.env[key]))) pass('android.signing-env', '当前终端已提供 Release 签名变量');
  else warn('android.signing-env', '当前终端未完整提供 Release 签名变量', `打包前设置 ${signingVariables.join('、')}`);

  if (product.modules.advertising) {
    const aarFiles = [
      'GDTSDK.unionNormal.4.680.1550.aar',
      'Baidu_MobAds_SDK_v9.4503.aar',
      'kssdk-ad-5.3.20.1.aar',
      'windAd-4.25.14.aar',
      'windAd-common-2.0.1.aar',
    ];
    const missing = aarFiles.filter((file) => !fs.existsSync(path.join(appRoot, 'libs', file)));
    missing.length
      ? fail('android.adn-aars', `缺少 ${missing.length} 个 GroMore ADN AAR`, missing.join(', '))
      : pass('android.adn-aars', 'GroMore 第三方 ADN AAR 完整');
  }

  const sdkSetting = path.join(root, `SDK_Setting_${product.advertising.gromore.appId}.json`);
  fs.existsSync(sdkSetting)
    ? pass('android.sdk-setting', '穿山甲 SDK Setting 文件存在')
    : fail('android.sdk-setting', `缺少 ${path.basename(sdkSetting)}`);
}

function checkRepository() {
  let tracked = [];
  try {
    tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  } catch {
    warn('git.available', '无法读取 Git 文件清单');
    return;
  }
  const forbidden = tracked.filter((file) => {
    const normalized = file.replaceAll('\\', '/');
    if (/\.env\.example$/.test(normalized)) return false;
    if (/^Admin\/apps\/web-naive\/\.env(?:\.[a-z]+)?$/.test(normalized)) return false;
    if (normalized === 'MobileReactNative/android/app/debug.keystore') return false;
    return /(^|\/)\.env(?:\.|$)|\.(?:jks|keystore|p12|pfx|pem|apk|aab)$/i.test(normalized);
  });
  forbidden.length
    ? fail('git.secrets', 'Git 正在跟踪可能包含秘密或二进制发布物的文件', forbidden.join(', '))
    : pass('git.secrets', 'Git 未跟踪常见密钥、环境变量和安装包文件');

  const oversized = tracked.filter((file) => {
    try { return fs.statSync(path.join(root, file)).size > 50 * 1024 * 1024; } catch { return false; }
  });
  oversized.length
    ? fail('git.large-files', 'Git 中存在超过 50MB 的文件', oversized.join(', '))
    : pass('git.large-files', 'Git 中没有超过 50MB 的文件');
}

async function checkLive(product) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const ready = await fetch(`${product.domains.productionApiOrigin}/ready`, { signal: controller.signal });
    if (!ready.ok) fail('live.ready', `线上健康检查返回 HTTP ${ready.status}`);
    else {
      const payload = await ready.json();
      payload?.data?.status === 'ready' ? pass('live.ready', '线上 API 健康检查正常') : fail('live.ready', '线上 API 未返回 ready 状态');
    }
    const docs = await fetch(`${product.domains.productionApiOrigin}/docs`, { redirect: 'manual', signal: controller.signal });
    docs.status === 404
      ? pass('live.docs', '线上接口文档未开放')
      : fail('live.docs', `线上 /docs 返回 HTTP ${docs.status}，生产环境不应开放接口文档`);

    const download = await fetch(`${product.domains.productionApiOrigin}/download`, { signal: controller.signal });
    const contentType = download.headers.get('content-type') || '';
    if (download.ok && contentType.includes('text/html')) {
      pass('live.download', '线上 APP 下载页可以访问');
      const html = await download.text();
      const apkUrl = html.match(/https:\/\/[^"'<>\s]+\.apk(?:\?[^"'<>\s]*)?/i)?.[0]?.replaceAll('&amp;', '&');
      if (!apkUrl) warn('live.apk-link', '下载页中没有找到 HTTPS APK 链接');
      else {
        const apk = await fetch(apkUrl, { method: 'HEAD', redirect: 'follow', signal: controller.signal });
        apk.ok
          ? pass('live.apk-link', '下载页中的 APK 地址可以访问')
          : fail('live.apk-link', `APK 地址返回 HTTP ${apk.status}`);
      }
    } else fail('live.download', `线上 APP 下载页异常：HTTP ${download.status}`);
  } catch (error) {
    fail('live.network', `线上探测失败：${error.name === 'AbortError' ? '请求超时' : error.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

function printReport() {
  const counts = {
    pass: findings.filter((item) => item.level === 'pass').length,
    warning: findings.filter((item) => item.level === 'warning').length,
    error: findings.filter((item) => item.level === 'error').length,
  };
  if (options.json) {
    console.log(JSON.stringify({ mode: options.production ? 'production' : 'local', counts, findings }, null, 2));
  } else {
    const icons = { pass: '✓', warning: '!', error: '✗' };
    console.log(`\n产品体检（${options.production ? '生产严格模式' : '本地模式'}）\n`);
    for (const finding of findings) {
      console.log(`${icons[finding.level]} [${finding.code}] ${finding.message}`);
      if (finding.hint) console.log(`  建议：${finding.hint}`);
    }
    console.log(`\n结果：${counts.pass} 通过，${counts.warning} 警告，${counts.error} 错误`);
  }
  if (counts.error) process.exitCode = 1;
}

async function main() {
  if (options.help) {
    usage();
    return;
  }
  let product;
  try {
    product = normalizeAndValidateProductConfig(readProductConfig(path.join(root, 'product.config.json')));
    pass('product.config', '产品源配置格式与模块依赖正确');
  } catch (error) {
    fail('product.config', error.message);
    printReport();
    return;
  }
  checkGeneratedProduct(product);
  const runtime = selectRuntimeEnv();
  const deployEnv = checkDeployEnv();
  checkRuntimeEnv(runtime.values, product, deployEnv);
  checkAndroid(product);
  checkRepository();
  if (options.live) await checkLive(product);
  printReport();
}

main().catch((error) => {
  fail('doctor.unexpected', error.message);
  printReport();
});
