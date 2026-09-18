<script lang="ts" setup>
import type { DataTableColumns } from 'naive-ui';

import type { RewardMilestone, RewardRule } from '#/api';

import { h, onMounted, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';

import { NButton, NCard, NDataTable, NForm, NFormItem, NInput, NInputNumber, NModal, NSelect, NSwitch, useMessage } from 'naive-ui';

import { getAdRewardConfigApi, getRewardRulesApi, getSystemConfigsApi, updateAdRewardConfigApi, updateRewardRuleApi, updateSystemConfigApi } from '#/api';
import { contentType } from '#/config/product.generated';

defineOptions({ name: 'RewardRules' });
const message = useMessage();
const loading = ref(false);
const savingAdConfig = ref(false);
const rows = ref<RewardRule[]>([]);
const visible = ref(false);
const saving = ref(false);
const form = reactive({ code: '', name: '', amount: '0', enabled: true });
const adShare = reactive({ viewer: 50, direct: 0, indirect: 0, dailyLimit: 5, splashEnabled: false, feedEnabled: false, fullScreenEnabled: false, rewardedVideoEnabled: true, contentUnlockEnabled: true, rewardedAdMilestones: [] as RewardMilestone[], inviteMilestones: [] as RewardMilestone[] });
const periodOptions = [{ label: '每日', value: 'DAILY' }, { label: '永久累计', value: 'LIFETIME' }];
const goldenConfig = reactive({ enabled: true, requiredMinutes: 5, heartbeatSeconds: 15, firstStart: '12:00', firstEnd: '14:00', secondStart: '18:00', secondEnd: '22:00' });
const columns: DataTableColumns<RewardRule> = [
  { title: '规则', key: 'name' },
  { title: '编码', key: 'code', width: 170 },
  { title: '奖励金币', key: 'amount', width: 110 },
  { title: '状态', key: 'enabled', width: 90, render: (row) => row.enabled ? '启用' : '停用' },
  { title: '说明', key: 'description' },
  { title: '操作', key: 'actions', width: 90, render: (row) => h(NButton, { size: 'small', onClick: () => openEdit(row) }, { default: () => '编辑' }) },
];
function applyAdRewardConfig(config: Awaited<ReturnType<typeof getAdRewardConfigApi>>) {
  Object.assign(adShare, { viewer: config.defaultShareRateBps / 100, direct: config.directShareRateBps / 100, indirect: config.indirectShareRateBps / 100, dailyLimit: config.dailyRewardedAdLimit, splashEnabled: config.splashRewardEnabled, feedEnabled: config.feedRewardEnabled, fullScreenEnabled: config.fullScreenRewardEnabled, rewardedVideoEnabled: config.rewardedVideoRewardEnabled, contentUnlockEnabled: config.contentUnlockRewardEnabled, rewardedAdMilestones: (config.rewardedAdMilestones ?? []).map(item => ({...item})), inviteMilestones: (config.inviteMilestones ?? []).map(item => ({...item})) });
}
async function load() { loading.value = true; try { const [rules, config, systemConfigs] = await Promise.all([getRewardRulesApi(), getAdRewardConfigApi(), getSystemConfigsApi()]); rows.value = rules; applyAdRewardConfig(config); const value = systemConfigs.find(item => item.key === 'reward.golden_watch')?.value as any; if (value) Object.assign(goldenConfig, {enabled: value.enabled !== false, requiredMinutes: Math.max(1, Math.round(Number(value.requiredSeconds ?? 300) / 60)), heartbeatSeconds: Number(value.heartbeatSeconds ?? 15), firstStart: value.periods?.[0]?.start ?? '12:00', firstEnd: value.periods?.[0]?.end ?? '14:00', secondStart: value.periods?.[1]?.start ?? '18:00', secondEnd: value.periods?.[1]?.end ?? '22:00'}); } finally { loading.value = false; } }
function addMilestone(target: 'inviteMilestones' | 'rewardedAdMilestones') { adShare[target].push({ count: 1, rewardCoins: 100, period: 'DAILY' }); }
function removeMilestone(target: 'inviteMilestones' | 'rewardedAdMilestones', index: number) { adShare[target].splice(index, 1); }
async function saveGoldenConfig() {
  const times = [goldenConfig.firstStart, goldenConfig.firstEnd, goldenConfig.secondStart, goldenConfig.secondEnd];
  if (times.some(value => !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))) return message.error('时段必须使用 HH:mm 格式');
  if (goldenConfig.firstStart >= goldenConfig.firstEnd || goldenConfig.secondStart >= goldenConfig.secondEnd) return message.error('结束时间必须晚于开始时间');
  await updateSystemConfigApi('reward.golden_watch', {description: '黄金时段观剧任务配置，按北京时间生效', value: {enabled: goldenConfig.enabled, requiredSeconds: goldenConfig.requiredMinutes * 60, heartbeatSeconds: goldenConfig.heartbeatSeconds, periods: [{start: goldenConfig.firstStart, end: goldenConfig.firstEnd}, {start: goldenConfig.secondStart, end: goldenConfig.secondEnd}]}});
  message.success('黄金时段观剧配置已更新');
}
async function saveGlobalAdShare() {
  if ([adShare.viewer, adShare.direct, adShare.indirect].some((value) => value < 0 || value > 100)) return message.error('分成比例必须在 0%-100% 之间');
  if (adShare.direct + adShare.indirect > 100) return message.error('直推和间推返佣比例合计不能超过 100%');
  if (!Number.isInteger(adShare.dailyLimit) || adShare.dailyLimit < 0 || adShare.dailyLimit > 1000) return message.error('每日广告次数必须是 0-1000 的整数');
  const allMilestones = [...adShare.rewardedAdMilestones, ...adShare.inviteMilestones];
  if (allMilestones.some(item => !Number.isInteger(item.count) || item.count < 1 || !Number.isInteger(item.rewardCoins) || item.rewardCoins < 1)) return message.error('阶梯次数和奖励金币必须是正整数');
  if (adShare.rewardedAdMilestones.some(item => item.period === 'DAILY' && item.count > adShare.dailyLimit)) return message.error('每日广告阶梯不能超过每日广告收益上限');
  const hasDuplicate = (items: RewardMilestone[]) => new Set(items.map(item => `${item.period}:${item.count}`)).size !== items.length;
  if (hasDuplicate(adShare.rewardedAdMilestones) || hasDuplicate(adShare.inviteMilestones)) return message.error('同一任务、周期和次数不能重复配置');
  savingAdConfig.value = true;
  try {
    const saved = await updateAdRewardConfigApi({ defaultShareRateBps: Math.round(adShare.viewer * 100), directShareRateBps: Math.round(adShare.direct * 100), indirectShareRateBps: Math.round(adShare.indirect * 100), dailyRewardedAdLimit: adShare.dailyLimit, splashRewardEnabled: adShare.splashEnabled, feedRewardEnabled: adShare.feedEnabled, fullScreenRewardEnabled: adShare.fullScreenEnabled, rewardedVideoRewardEnabled: adShare.rewardedVideoEnabled, contentUnlockRewardEnabled: adShare.contentUnlockEnabled, rewardedAdMilestones: adShare.rewardedAdMilestones.map(item => ({...item})), inviteMilestones: adShare.inviteMilestones.map(item => ({...item})) });
    applyAdRewardConfig(saved);
    // PUT 成功后再从数据库读一次，页面不会把“发送成功”误当成“持久化成功”。
    const persisted = await getAdRewardConfigApi();
    applyAdRewardConfig(persisted);
    if (!Array.isArray(persisted.rewardedAdMilestones) || !Array.isArray(persisted.inviteMilestones)) {
      return message.warning('全局广告配置已保存，但线上后端版本过旧，阶梯任务未持久化');
    }
    message.success('全局广告和阶梯任务配置已保存');
  } finally {
    savingAdConfig.value = false;
  }
}
function openEdit(row: RewardRule) { Object.assign(form, { code: row.code, name: row.name, amount: row.amount, enabled: row.enabled }); visible.value = true; }
async function save() {
  if (!/^\d+$/.test(form.amount)) return message.error('奖励金币必须是非负整数');
  saving.value = true;
  try { await updateRewardRuleApi(form.code, { amount: form.amount, enabled: form.enabled }); message.success('奖励规则已更新'); visible.value = false; await load(); }
  finally { saving.value = false; }
}
onMounted(load);
</script>

<template>
  <Page title="奖励规则" description="配置注册、邀请和连续签到奖励，修改后立即生效">
    <NCard v-if="contentType === 'shortDrama'" class="mb-4" title="黄金时段观剧">
      <div class="grid grid-cols-1 gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
        <NFormItem label="启用任务"><NSwitch v-model:value="goldenConfig.enabled" /></NFormItem>
        <NFormItem label="有效观看"><NInputNumber v-model:value="goldenConfig.requiredMinutes" :min="1" :max="1440" :precision="0" class="w-full"><template #suffix>分钟</template></NInputNumber></NFormItem>
        <NFormItem label="心跳间隔"><NInputNumber v-model:value="goldenConfig.heartbeatSeconds" :min="5" :max="60" :precision="0" class="w-full"><template #suffix>秒</template></NInputNumber></NFormItem>
        <NFormItem label="结算规则"><div class="text-gray-500">每日一次，金额在下方规则中配置</div></NFormItem>
        <NFormItem label="第一时段"><div class="flex gap-2"><NInput v-model:value="goldenConfig.firstStart" placeholder="12:00" /><NInput v-model:value="goldenConfig.firstEnd" placeholder="14:00" /></div></NFormItem>
        <NFormItem label="第二时段"><div class="flex gap-2"><NInput v-model:value="goldenConfig.secondStart" placeholder="18:00" /><NInput v-model:value="goldenConfig.secondEnd" placeholder="22:00" /></div></NFormItem>
        <NFormItem label="操作"><NButton type="primary" @click="saveGoldenConfig">保存黄金时段配置</NButton></NFormItem>
      </div>
      <div class="text-gray-500">时段按北京时间判断；仅累计穿山甲播放器在前台的有效观看时长，退出、锁屏或切到后台会停止持续累计。</div>
    </NCard>
    <NCard class="mb-4" title="全局广告分成">
      <div class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div class="flex items-center justify-between rounded-lg border border-gray-700 px-4 py-3"><div><div>激励视频发币</div><div class="text-xs text-gray-500">服务端回调验真后结算</div></div><NSwitch v-model:value="adShare.rewardedVideoEnabled" /></div>
        <div class="flex items-center justify-between rounded-lg border border-gray-700 px-4 py-3"><div><div>内容解锁广告发币</div><div class="text-xs text-gray-500">解锁成功并经服务端验真后结算</div></div><NSwitch v-model:value="adShare.contentUnlockEnabled" /></div>
      </div>
      <div class="grid grid-cols-1 gap-x-4 sm:grid-cols-2 lg:grid-cols-5">
        <NFormItem label="观看用户"><NInputNumber v-model:value="adShare.viewer" :min="0" :max="100" :precision="2" class="w-full"><template #suffix>%</template></NInputNumber></NFormItem>
        <NFormItem label="直推分成"><NInputNumber v-model:value="adShare.direct" :min="0" :max="100" :precision="2" class="w-full"><template #suffix>%</template></NInputNumber></NFormItem>
        <NFormItem label="间推分成"><NInputNumber v-model:value="adShare.indirect" :min="0" :max="100" :precision="2" class="w-full"><template #suffix>%</template></NInputNumber></NFormItem>
        <NFormItem label="每日激励收益次数"><NInputNumber v-model:value="adShare.dailyLimit" :min="0" :max="1000" :precision="0" class="w-full"><template #suffix>次</template></NInputNumber></NFormItem>
        <NFormItem label="操作"><NButton class="w-full" type="primary" :loading="savingAdConfig" @click="saveGlobalAdShare">保存全局配置</NButton></NFormItem>
      </div>
      <div class="text-gray-500">观看用户取得广告收入乘用户比例后的完整收益；直推、间推返佣由平台额外支付。福利中心任务激励与内容解锁激励共用每日收益次数，达到上限后内容仍可按自身规则解锁，但不再发放金币。</div>
    </NCard>
    <NCard class="mb-4" title="阶梯任务配置">
      <div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div>
          <div class="mb-3 flex items-center justify-between"><div><div class="font-medium">激励广告收益任务</div><div class="text-xs text-gray-500">普通激励与内容解锁的成功收益次数合并统计</div></div><NButton size="small" @click="addMilestone('rewardedAdMilestones')">新增档位</NButton></div>
          <div v-if="!adShare.rewardedAdMilestones.length" class="rounded-lg border border-dashed border-gray-700 p-5 text-center text-gray-500">尚未配置阶梯档位</div>
          <div v-for="(item, index) in adShare.rewardedAdMilestones" :key="`ad-${index}`" class="mb-2 grid grid-cols-[120px_1fr_1fr_auto] items-center gap-2 rounded-lg border border-gray-700 p-3">
            <NSelect v-model:value="item.period" :options="periodOptions" />
            <NInputNumber v-model:value="item.count" :min="1" :max="1000" :precision="0" placeholder="收益次数"><template #suffix>次</template></NInputNumber>
            <NInputNumber v-model:value="item.rewardCoins" :min="1" :max="1000000000" :precision="0" placeholder="额外金币"><template #suffix>金币</template></NInputNumber>
            <NButton quaternary type="error" @click="removeMilestone('rewardedAdMilestones', index)">删除</NButton>
          </div>
        </div>
        <div>
          <div class="mb-3 flex items-center justify-between"><div><div class="font-medium">邀请好友任务</div><div class="text-xs text-gray-500">按成功绑定邀请码的有效直邀人数统计</div></div><NButton size="small" @click="addMilestone('inviteMilestones')">新增档位</NButton></div>
          <div v-if="!adShare.inviteMilestones.length" class="rounded-lg border border-dashed border-gray-700 p-5 text-center text-gray-500">尚未配置阶梯档位</div>
          <div v-for="(item, index) in adShare.inviteMilestones" :key="`invite-${index}`" class="mb-2 grid grid-cols-[120px_1fr_1fr_auto] items-center gap-2 rounded-lg border border-gray-700 p-3">
            <NSelect v-model:value="item.period" :options="periodOptions" />
            <NInputNumber v-model:value="item.count" :min="1" :max="1000000" :precision="0" placeholder="邀请人数"><template #suffix>人</template></NInputNumber>
            <NInputNumber v-model:value="item.rewardCoins" :min="1" :max="1000000000" :precision="0" placeholder="额外金币"><template #suffix>金币</template></NInputNumber>
            <NButton quaternary type="error" @click="removeMilestone('inviteMilestones', index)">删除</NButton>
          </div>
        </div>
      </div>
      <div class="mt-4 flex items-center justify-between"><div class="text-gray-500">每日档位按北京时间 00:00 重置；永久累计档位每个账号终身只奖励一次。</div><NButton type="primary" :loading="savingAdConfig" @click="saveGlobalAdShare">保存阶梯任务</NButton></div>
    </NCard>
    <NCard><NDataTable :columns="columns" :data="rows" :loading="loading" /></NCard>
    <NModal v-model:show="visible" preset="card" title="编辑奖励规则" class="modal-sm">
      <NForm label-placement="left" label-width="90">
        <NFormItem label="规则">{{ form.name }}</NFormItem>
        <NFormItem label="奖励金币"><NInput v-model:value="form.amount" /></NFormItem>
        <NFormItem label="是否启用"><NSwitch v-model:value="form.enabled" /></NFormItem>
      </NForm>
      <template #footer><div class="flex justify-end gap-2"><NButton @click="visible = false">取消</NButton><NButton type="primary" :loading="saving" @click="save">保存</NButton></div></template>
    </NModal>
  </Page>
</template>
