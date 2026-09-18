import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  applyModuleOverrides,
  normalizeAndValidateProductConfig,
  readProductConfig,
} from './product-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(root, 'product.config.json');
let config = readProductConfig(configPath);
const argumentsList = process.argv.slice(2);
const checkOnly = argumentsList.includes('--check');
const backendOnly = argumentsList.includes('--backend-only');
const moduleOverrides = [];
for (const argument of argumentsList.filter((item) => item.startsWith('--module='))) {
  const match = argument.match(/^--module=([A-Za-z][A-Za-z0-9]*)=(true|false)$/);
  if (!match) throw new Error(`模块覆盖参数格式无效：${argument}`);
  moduleOverrides.push([match[1], match[2] === 'true']);
}
config = applyModuleOverrides(config, moduleOverrides);
const product = normalizeAndValidateProductConfig(config);
if (checkOnly) {
  console.log(`产品配置校验通过：${JSON.stringify(product.modules)}`);
  process.exit(0);
}

function writeIfChanged(file, content) {
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (current === content) return false;
  fs.writeFileSync(file, content, 'utf8');
  return true;
}

function replaceEnvValue(file, key, value) {
  if (!fs.existsSync(file)) return false;
  const source = fs.readFileSync(file, 'utf8');
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  const next = pattern.test(source)
    ? source.replace(pattern, line)
    : `${source.replace(/\s*$/, '')}\n${line}\n`;
  return writeIfChanged(file, next);
}

const changed = [];
if (!backendOnly) {
  const generatedPath = path.join(root, 'MobileReactNative', 'product.generated.json');
  if (writeIfChanged(generatedPath, `${JSON.stringify(product, null, 2)}\n`)) changed.push(path.relative(root, generatedPath));
}

function generatedTypeScript() {
  return `// 此文件由 scripts/sync-product-config.mjs 自动生成，请勿手动修改。\nexport const productConfig = ${JSON.stringify(product, null, 2)} as const;\n\nexport const productModules = productConfig.modules;\nexport type ProductModuleKey = keyof typeof productModules;\nexport type ProductModules = Record<ProductModuleKey, boolean>;\nexport type ContentType = 'music' | 'none' | 'novel' | 'quiz' | 'shortDrama';\nexport const contentType: ContentType = productConfig.content.type;\nexport type AdvertisingProvider = 'gromore' | 'none' | 'taku';\nexport const advertisingProvider: AdvertisingProvider = productConfig.advertising.provider;\n`;
}

const generatedFiles = backendOnly
  ? [path.join(root, 'Backend', 'src', 'generated', 'product.generated.ts')]
  : [
      path.join(root, 'Backend', 'src', 'generated', 'product.generated.ts'),
      path.join(root, 'Admin', 'apps', 'web-naive', 'src', 'config', 'product.generated.ts'),
    ];
for (const generatedFile of generatedFiles) {
  fs.mkdirSync(path.dirname(generatedFile), { recursive: true });
  if (writeIfChanged(generatedFile, generatedTypeScript())) changed.push(path.relative(root, generatedFile));
}

if (!backendOnly) {
  const appJsonPath = path.join(root, 'MobileReactNative', 'app.json');
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  appJson.displayName = product.brand.appDisplayName;
  if (writeIfChanged(appJsonPath, `${JSON.stringify(appJson, null, 2)}\n`)) changed.push(path.relative(root, appJsonPath));

  const adminEnv = path.join(root, 'Admin', 'apps', 'web-naive', '.env.example');
  if (replaceEnvValue(adminEnv, 'VITE_APP_BRAND_NAME', product.brand.appDisplayName)) changed.push(path.relative(root, adminEnv));
  if (replaceEnvValue(adminEnv, 'VITE_APP_TITLE', product.brand.adminTitle)) changed.push(path.relative(root, adminEnv));
  if (replaceEnvValue(adminEnv, 'VITE_APP_NAMESPACE', product.admin.namespace)) changed.push(path.relative(root, adminEnv));

  const adminProductionEnv = path.join(root, 'Admin', 'apps', 'web-naive', '.env.production.example');
  if (replaceEnvValue(adminProductionEnv, 'VITE_GLOB_API_URL', `${product.domains.productionApiOrigin}/api/v1`)) changed.push(path.relative(root, adminProductionEnv));

  const adminIndexPath = path.join(root, 'Admin', 'apps', 'web-naive', 'index.html');
  const adminIndex = fs.readFileSync(adminIndexPath, 'utf8')
    .replace(/(<meta name="description" content=")[^"]*(" \/>)/, `$1${product.brand.adminDescription}$2`)
    .replace(/(<meta name="keywords" content=")[^"]*(" \/>)/, `$1${product.brand.appDisplayName},运营管理$2`)
    .replace(/(<meta name="author" content=")[^"]*(" \/>)/, `$1${product.brand.companyName}$2`);
  if (writeIfChanged(adminIndexPath, adminIndex)) changed.push(path.relative(root, adminIndexPath));

  for (const file of [path.join(root, 'Backend', '.env.example'), path.join(root, 'Backend', '.env')]) {
    if (replaceEnvValue(file, 'APP_BRAND_NAME', product.brand.appDisplayName)) changed.push(path.relative(root, file));
  }

  execFileSync(process.execPath, [path.join(root, 'MobileReactNative', 'scripts', 'sync-app-brand.js')], {stdio: 'inherit'});
}
console.log(changed.length ? `已同步产品配置：\n- ${[...new Set(changed)].join('\n- ')}` : '产品配置已是最新状态');
