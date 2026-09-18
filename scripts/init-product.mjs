import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import {
  applyModuleOverrides,
  normalizeAndValidateProductConfig,
  productModuleKeys,
  readProductConfig,
} from './product-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(root, 'product.config.json');

const fieldDefinitions = [
  ['product-code', 'productCode', '产品英文标识'],
  ['app-name', 'brand.appDisplayName', 'APP 显示名称'],
  ['admin-title', 'brand.adminTitle', '管理后台名称'],
  ['admin-description', 'brand.adminDescription', '管理后台说明'],
  ['company-name', 'brand.companyName', '运营公司名称'],
  ['application-id', 'android.applicationId', 'Android applicationId'],
  ['admin-namespace', 'admin.namespace', 'Admin 缓存命名空间'],
  ['api-origin', 'domains.productionApiOrigin', '线上 API 根地址'],
  ['content-type', 'content.type', '内容类型（none/shortDrama/quiz/novel/music）'],
  ['short-drama-sdk-id', 'content.providers.shortDrama.sdkSettingId', '短剧内容 SDK Setting ID'],
  ['ad-provider', 'advertising.provider', '广告平台（none/gromore/taku）'],
  ['ad-app-name', 'advertising.selected.registeredAppName', '当前广告平台注册应用名'],
  ['ad-app-id', 'advertising.selected.appId', '当前广告平台应用 ID'],
  ['splash-placement-id', 'advertising.selected.splashPlacementId', '开屏广告位 ID'],
  ['feed-placement-id', 'advertising.selected.feedPlacementId', '信息流广告位 ID'],
  ['fullscreen-placement-id', 'advertising.selected.fullScreenPlacementId', '全屏广告位 ID'],
  ['reward-placement-id', 'advertising.selected.rewardPlacementId', '激励视频广告位 ID'],
];

const moduleLabels = {
  advertising: '广告',
  rewards: '金币与奖励',
  invitations: '邀请好友',
  smsRegistration: '短信注册',
  withdrawals: '提现',
  alipayPayout: '支付宝自动打款',
};

function usage() {
  console.log(`
一键初始化三端产品配置

用法：
  npm run product:init
  npm run product:init -- --yes --app-name="新剧场" --product-code=new-theater
  npm run product:init -- --dry-run --module=invitations=false

常用参数：
  --yes                         跳过交互确认，适合脚本调用
  --dry-run                     只校验和预览，不写文件
  --module=<name>=true|false    设置模块，可重复传入
  --help                        查看帮助

产品参数：
${fieldDefinitions.map(([flag, , label]) => `  --${flag}=<值>${' '.repeat(Math.max(1, 28 - flag.length))}${label}`).join('\n')}

模块名称：${productModuleKeys.join(', ')}
`);
}

function parseArguments(argv) {
  const options = { yes: false, dryRun: false, help: false, values: new Map(), modules: [] };
  const knownFields = new Set(fieldDefinitions.map(([flag]) => flag));
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--yes') options.yes = true;
    else if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument.startsWith('--module=')) {
      const match = argument.match(/^--module=([A-Za-z][A-Za-z0-9]*)=(true|false)$/);
      if (!match) throw new Error(`模块参数格式无效：${argument}`);
      options.modules.push([match[1], match[2] === 'true']);
    } else if (argument.startsWith('--')) {
      const equalIndex = argument.indexOf('=');
      const flag = argument.slice(2, equalIndex === -1 ? undefined : equalIndex);
      if (!knownFields.has(flag)) throw new Error(`未知参数：--${flag}`);
      const value = equalIndex === -1 ? argv[++index] : argument.slice(equalIndex + 1);
      if (value === undefined || value.startsWith('--')) throw new Error(`参数 --${flag} 缺少值`);
      options.values.set(flag, value);
    } else {
      throw new Error(`无法识别参数：${argument}`);
    }
  }
  return options;
}

function getValue(object, dottedPath) {
  if (dottedPath.startsWith('advertising.selected.')) {
    const key = dottedPath.slice('advertising.selected.'.length);
    return object.advertising?.providers?.[object.advertising?.provider]?.[key];
  }
  return dottedPath.split('.').reduce((value, key) => value?.[key], object);
}

function setValue(object, dottedPath, value) {
  if (dottedPath.startsWith('advertising.selected.')) {
    const key = dottedPath.slice('advertising.selected.'.length);
    object.advertising ??= {};
    object.advertising.providers ??= {};
    const provider = object.advertising.provider;
    if (!provider || provider === 'none') throw new Error('设置广告位前必须先选择 gromore 或 taku');
    object.advertising.providers[provider] ??= {};
    object.advertising.providers[provider][key] = value;
    return;
  }
  const keys = dottedPath.split('.');
  const last = keys.pop();
  const target = keys.reduce((current, key) => (current[key] ??= {}), object);
  target[last] = value;
}

function changedFields(before, after) {
  const paths = [
    ...fieldDefinitions.map(([, dottedPath]) => dottedPath),
    ...productModuleKeys.map((key) => `modules.${key}`),
  ];
  return paths.filter((dottedPath) => {
    if (dottedPath.startsWith('advertising.selected.') && before.advertising?.provider !== after.advertising?.provider) return false;
    return getValue(before, dottedPath) !== getValue(after, dottedPath);
  });
}

function printSummary(before, after) {
  const changes = changedFields(before, after);
  if (!changes.length) {
    console.log('\n配置没有变化。');
    return changes;
  }
  console.log('\n即将更新：');
  for (const dottedPath of changes) {
    console.log(`- ${dottedPath}: ${JSON.stringify(getValue(before, dottedPath))} -> ${JSON.stringify(getValue(after, dottedPath))}`);
  }
  return changes;
}

async function promptText(readline, label, current) {
  const answer = (await readline.question(`${label} [${current}]: `)).trim();
  return answer || current;
}

async function promptBoolean(readline, label, current) {
  const hint = current ? 'Y/n' : 'y/N';
  while (true) {
    const answer = (await readline.question(`${label} [${hint}]: `)).trim().toLowerCase();
    if (!answer) return current;
    if (['y', 'yes', '1', 'true'].includes(answer)) return true;
    if (['n', 'no', '0', 'false'].includes(answer)) return false;
    console.log('请输入 y 或 n。');
  }
}

async function collectInteractively(candidate) {
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('按 Enter 保留当前值。配置中不会写入密码、AccessKey 或私钥。\n');
    for (const [, dottedPath, label] of fieldDefinitions) {
      if (dottedPath.startsWith('advertising.selected.') && candidate.advertising?.provider === 'none') continue;
      setValue(candidate, dottedPath, await promptText(readline, label, getValue(candidate, dottedPath)));
    }

    candidate.modules.advertising = await promptBoolean(readline, '启用广告', candidate.modules.advertising);
    if (!candidate.modules.advertising) candidate.advertising.provider = 'none';
    candidate.modules.rewards = await promptBoolean(readline, '启用金币与奖励', candidate.modules.rewards);
    if (candidate.modules.rewards) {
      candidate.modules.invitations = await promptBoolean(readline, '启用邀请好友', candidate.modules.invitations);
      candidate.modules.withdrawals = await promptBoolean(readline, '启用提现', candidate.modules.withdrawals);
    } else {
      candidate.modules.invitations = false;
      candidate.modules.withdrawals = false;
      candidate.modules.alipayPayout = false;
      console.log('已随金币与奖励模块关闭：邀请好友、提现、支付宝自动打款。');
    }
    candidate.modules.smsRegistration = await promptBoolean(readline, '启用短信注册', candidate.modules.smsRegistration);
    if (candidate.modules.withdrawals) {
      candidate.modules.alipayPayout = await promptBoolean(readline, '启用支付宝自动打款', candidate.modules.alipayPayout);
    } else {
      candidate.modules.alipayPayout = false;
    }
    return readline;
  } catch (error) {
    readline.close();
    throw error;
  }
}

function backupConfig(originalText) {
  const backupDirectory = path.join(root, '.git-local-backups');
  fs.mkdirSync(backupDirectory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDirectory, `product.config.${stamp}.json`);
  fs.writeFileSync(backupPath, originalText, 'utf8');
  return backupPath;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  if (!options.yes && !process.stdin.isTTY) {
    throw new Error('当前终端不支持交互，请添加 --yes 并通过参数传入需要修改的值');
  }

  const originalText = fs.readFileSync(configPath, 'utf8');
  const original = readProductConfig(configPath);
  let candidate = structuredClone(original);
  for (const [flag, dottedPath] of fieldDefinitions) {
    if (options.values.has(flag)) setValue(candidate, dottedPath, options.values.get(flag));
  }
  candidate = applyModuleOverrides(candidate, options.modules);

  let readline;
  if (!options.yes) readline = await collectInteractively(candidate);
  let normalized;
  try {
    normalized = normalizeAndValidateProductConfig(candidate);
  } catch (error) {
    readline?.close();
    throw error;
  }
  candidate = { $schema: original.$schema ?? './schemas/product-config.schema.json', ...normalized };
  const changes = printSummary(original, candidate);

  if (!changes.length) {
    readline?.close();
    return;
  }
  if (options.dryRun) {
    readline?.close();
    console.log('\n预览完成，未写入任何文件。');
    return;
  }
  if (!options.yes) {
    const confirmed = await promptBoolean(readline, '确认写入并同步三端配置', false);
    readline.close();
    if (!confirmed) {
      console.log('已取消，未写入任何文件。');
      return;
    }
  }

  const backupPath = backupConfig(originalText);
  try {
    fs.writeFileSync(configPath, `${JSON.stringify(candidate, null, 2)}\n`, 'utf8');
    execFileSync(process.execPath, [path.join(root, 'scripts', 'sync-product-config.mjs')], {
      cwd: root,
      stdio: 'inherit',
    });
    console.log(`\n初始化完成。原配置备份：${path.relative(root, backupPath)}`);
  } catch (error) {
    fs.writeFileSync(configPath, originalText, 'utf8');
    console.error('初始化失败，已恢复原 product.config.json。');
    throw error;
  }
}

main().catch((error) => {
  console.error(`\n错误：${error.message}`);
  process.exitCode = 1;
});
