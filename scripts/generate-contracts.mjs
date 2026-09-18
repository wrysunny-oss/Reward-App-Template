import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backendOnly = process.argv.slice(2).includes('--backend-only');
const contractPath = path.join(root, 'contracts', 'reward.contract.json');
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));

function assertIdentifier(value, key) {
  if (typeof value !== 'string' || !/^[A-Za-z_$][\w$]*$/.test(value)) {
    throw new Error(`${key} 必须是有效的 TypeScript 字段名`);
  }
  return value;
}

function assertPositiveInteger(value, key) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${key} 必须是正整数`);
  }
  return value;
}

if (contract.schemaVersion !== 1) throw new Error('暂不支持该 reward.contract.json schemaVersion');

const periods = contract.milestonePeriods;
if (!Array.isArray(periods) || periods.length === 0 || periods.some((item) => typeof item !== 'string')) {
  throw new Error('milestonePeriods 必须是非空字符串数组');
}
if (new Set(periods).size !== periods.length) throw new Error('milestonePeriods 不能重复');

const configuration = contract.configuration ?? {};
const shareRateFields = (configuration.shareRateFields ?? []).map((item, index) =>
  assertIdentifier(item, `configuration.shareRateFields[${index}]`),
);
const dailyLimitField = assertIdentifier(configuration.dailyLimitField, 'configuration.dailyLimitField');
const switchFields = (configuration.switchFields ?? []).map((item, index) =>
  assertIdentifier(item, `configuration.switchFields[${index}]`),
);
const milestoneFields = Object.entries(configuration.milestoneFields ?? {}).map(([field, limitKey]) => ({
  field: assertIdentifier(field, `configuration.milestoneFields.${field}`),
  limitKey: assertIdentifier(limitKey, `configuration.milestoneFields.${field}`),
}));

if (shareRateFields.length === 0 || switchFields.length === 0 || milestoneFields.length === 0) {
  throw new Error('奖励配置字段不能为空');
}

const limits = Object.fromEntries(
  Object.entries(contract.limits ?? {}).map(([key, value]) => [key, assertPositiveInteger(value, `limits.${key}`)]),
);
for (const requiredKey of ['shareRateBpsMax', 'dailyRewardedAdLimitMax', 'milestoneItemsMax', 'rewardCoinsMax']) {
  if (!(requiredKey in limits)) throw new Error(`limits 缺少 ${requiredKey}`);
}
for (const { limitKey } of milestoneFields) {
  if (!(limitKey in limits)) throw new Error(`limits 缺少 ${limitKey}`);
}

const periodUnion = periods.map((period) => JSON.stringify(period)).join(' | ');
const periodTuple = periods.map((period) => JSON.stringify(period)).join(', ');
const generatedBanner = '// 此文件由 scripts/generate-contracts.mjs 自动生成，请勿手动修改。';

const baseTypeFields = [
  ...shareRateFields.map((field) => `  ${field}: number;`),
  `  ${dailyLimitField}: number;`,
  ...switchFields.map((field) => `  ${field}: boolean;`),
  ...milestoneFields.map(({ field }) => `  ${field}: RewardMilestoneDefinition[];`),
].join('\n');

const backendSchemaFields = [
  ...shareRateFields.map((field) => `  ${field}: z.number().int().min(0).max(${limits.shareRateBpsMax}),`),
  `  ${dailyLimitField}: z.number().int().min(0).max(${limits.dailyRewardedAdLimitMax}),`,
  ...switchFields.map((field) => `  ${field}: z.boolean(),`),
  ...milestoneFields.map(({ field, limitKey }) =>
    `  ${field}: createRewardMilestoneSchema(${limits[limitKey]}).array().max(${limits.milestoneItemsMax}),`,
  ),
].join('\n');

const backendSource = `${generatedBanner}
import { z } from "zod";

export const rewardMilestonePeriodSchema = z.enum([${periodTuple}]);

export const createRewardMilestoneSchema = (maxCount: number) => z.object({
  count: z.number().int().min(1).max(maxCount),
  rewardCoins: z.number().int().min(1).max(${limits.rewardCoinsMax}),
  period: rewardMilestonePeriodSchema,
});

export const updateAdRewardConfigBaseSchema = z.object({
${backendSchemaFields}
});

export type RewardMilestonePeriod = z.infer<typeof rewardMilestonePeriodSchema>;
export type RewardMilestoneDefinition = z.infer<ReturnType<typeof createRewardMilestoneSchema>>;
export type UpdateAdRewardConfig = z.infer<typeof updateAdRewardConfigBaseSchema>;
`;

const sharedTypeSource = `${generatedBanner}
export type RewardMilestonePeriod = ${periodUnion};

export interface RewardMilestoneDefinition {
  count: number;
  rewardCoins: number;
  period: RewardMilestonePeriod;
}

export interface UpdateAdRewardConfig {
${baseTypeFields}
}
`;

const adminSource = `${sharedTypeSource}
export interface AdRewardConfig extends UpdateAdRewardConfig {
  secureEcpmReady: boolean;
}
`;

const mobileSource = `${sharedTypeSource}
export interface RewardMilestoneProgress extends RewardMilestoneDefinition {
  progress: number;
  completed: boolean;
}
`;

function writeGenerated(relativePath, content) {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const normalized = `${content.trimEnd()}\n`;
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (current === normalized) return false;
  fs.writeFileSync(file, normalized, 'utf8');
  return true;
}

const outputs = backendOnly
  ? [['Backend/src/contracts/reward.generated.ts', backendSource]]
  : [
      ['Backend/src/contracts/reward.generated.ts', backendSource],
      ['Admin/apps/web-naive/src/api/generated/reward.generated.ts', adminSource],
      ['MobileReactNative/src/types/generated/reward.generated.ts', mobileSource],
    ];
const changed = outputs.filter(([file, content]) => writeGenerated(file, content)).map(([file]) => file);
console.log(changed.length > 0 ? `已更新共享契约：${changed.join(', ')}` : '共享契约已是最新状态');
