<script lang="ts" setup>
import type { AdEventSummary, AdRuntimeConfig, ShortDramaRuntimeConfig, SystemConfig } from '#/api';

import { computed, h, onMounted, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import {
  NAlert, NButton, NCard, NDataTable, NFormItem, NGrid, NGridItem,
  NInput, NInputNumber, NModal, NSelect, NStatistic, NSwitch, NTag, useMessage,
} from 'naive-ui';

import {
  getAdEventSummaryApi, getAdRuntimeConfigApi, getSystemConfigsApi,
  updateSystemConfigApi,
} from '#/api';
import { advertisingProvider, contentType, productConfig } from '#/config/product.generated';

defineOptions({ name: 'SystemConfigs' });
const message = useMessage();
const { hasAccessByCodes } = useAccess();
const canUpdate = hasAccessByCodes(['operation:update']);
const rows = ref<SystemConfig[]>([]);
const visible = ref(false);
const current = ref<SystemConfig>();
const json = ref('');
const description = ref('');
const savingAds = ref(false);
const savingContent = ref(false);
const summary = ref<AdEventSummary>();
const adProviderLabel = advertisingProvider === 'gromore' ? 'GroMore' : advertisingProvider === 'taku' ? 'Taku' : '未启用';
const selectedProvider = productConfig.advertising.providers[advertisingProvider as keyof typeof productConfig.advertising.providers];
const ads = ref<AdRuntimeConfig>({
  enabled: true,
  splash: { enabled: true, placementId: selectedProvider?.splashPlacementId ?? '000000', timeoutMs: 3000, safetyTimeoutMs: 5000 },
  feed: { enabled: true, placementId: selectedProvider?.feedPlacementId ?? '000000', insertEvery: 8 },
  fullScreen: { enabled: true, placementId: selectedProvider?.fullScreenPlacementId ?? '000000', playbackThreshold: 5, minimumIntervalMinutes: 20, loadTimeoutMs: 8000, showTimeoutMs: 120000 },
  reward: { enabled: true, placementId: selectedProvider?.rewardPlacementId ?? '000000' },
});
const shortDrama = ref<ShortDramaRuntimeConfig>({
  unlockMode: 'SPECIFIC', freeEpisodes: 10, unlockEpisodes: 10,
  continuousUnlock: false, hideRewardDialog: false, hideCellularToast: false,
  hideLikeButton: false, hideFavorButton: false, hideDoubleClick: false,
  hideLongClickSpeed: false, infiniteScrollEnabled: true,
});

const formats = [
  { key: 'SPLASH', label: '开屏' }, { key: 'FEED', label: '信息流' },
  { key: 'FULL_SCREEN', label: '插全屏' }, { key: 'REWARD', label: '激励视频' },
  { key: 'CONTENT_UNLOCK', label: '内容解锁' },
];
const metrics = computed(() => formats.map((format) => {
  const events = summary.value?.events.filter((item) => item.format === format.key) ?? [];
  const count = (eventType: string) => events.find((item) => item.eventType === eventType)?.count ?? 0;
  return { ...format, requests: count('REQUEST'), shows: count('SHOW'), clicks: count('CLICK'), failures: count('FAIL') };
}));

async function load() {
  const [configs, adConfig, adSummary] = await Promise.all([
    getSystemConfigsApi(), getAdRuntimeConfigApi(), getAdEventSummaryApi().catch(() => undefined),
  ]);
  rows.value = configs.filter((item) => !['ads.runtime_config', 'content.short_drama.runtime_config'].includes(item.key));
  ads.value = adConfig;
  const storedContent = configs.find((item) => item.key === 'content.short_drama.runtime_config')?.value
    ?? (configs.find((item) => item.key === 'ads.runtime_config')?.value as undefined | { drama?: unknown })?.drama;
  if (storedContent && typeof storedContent === 'object' && !Array.isArray(storedContent)) {
    shortDrama.value = { ...shortDrama.value, ...storedContent } as ShortDramaRuntimeConfig;
  }
  summary.value = adSummary;
}
function open(row: SystemConfig) {
  current.value = row; json.value = JSON.stringify(row.value, null, 2);
  description.value = row.description ?? ''; visible.value = true;
}
async function save() {
  if (!current.value) return;
  let value: unknown;
  try { value = JSON.parse(json.value); } catch { return message.error('请输入合法 JSON'); }
  await updateSystemConfigApi(current.value.key, { value, description: description.value.trim() || null });
  visible.value = false; message.success('配置已更新'); await load();
}
async function saveAds() {
  savingAds.value = true;
  try {
    await updateSystemConfigApi('ads.runtime_config', { value: ads.value, description: 'App 广告位、开关与频控策略' });
    message.success('广告策略已保存，将在 App 下次冷启动时生效'); await load();
  } finally { savingAds.value = false; }
}
async function saveShortDrama() {
  savingContent.value = true;
  try {
    await updateSystemConfigApi('content.short_drama.runtime_config', { value: shortDrama.value, description: '短剧 SDK 播放与解锁策略' });
    message.success('短剧内容策略已保存，将在 App 下次冷启动时生效'); await load();
  } finally { savingContent.value = false; }
}
onMounted(load);
</script>

<template>
  <Page title="参数与功能开关" description="统一维护 App 功能参数、广告位与投放频控；保存后由启动接口下发">
    <div class="flex flex-col gap-4">
      <NCard title="广告投放策略">
        <template #header-extra>
          <div class="flex items-center gap-3"><span class="text-sm text-gray-500">广告总开关</span><NSwitch v-model:value="ads.enabled" :disabled="!canUpdate" /></div>
        </template>
        <NAlert type="info" :bordered="false" class="mb-5">当前广告平台：{{ adProviderLabel }}。关闭总开关后，所有广告停止请求；内容模块仍按自身配置运行。</NAlert>
        <NGrid cols="1 s:2 xl:4" responsive="screen" :x-gap="16" :y-gap="16">
          <NGridItem>
            <NCard size="small" title="开屏广告" embedded>
              <template #header-extra><NSwitch v-model:value="ads.splash.enabled" :disabled="!canUpdate" /></template>
              <NFormItem :label="`${adProviderLabel} 广告位 ID`"><NInput v-model:value="ads.splash.placementId" /></NFormItem>
              <NFormItem label="SDK 加载超时（毫秒）"><NInputNumber v-model:value="ads.splash.timeoutMs" :min="1000" :max="10000" class="w-full" /></NFormItem>
              <NFormItem label="启动安全超时（毫秒）"><NInputNumber v-model:value="ads.splash.safetyTimeoutMs" :min="2000" :max="15000" class="w-full" /></NFormItem>
            </NCard>
          </NGridItem>
          <NGridItem>
            <NCard size="small" title="首页信息流" embedded>
              <template #header-extra><NSwitch v-model:value="ads.feed.enabled" :disabled="!canUpdate" /></template>
              <NFormItem :label="`${adProviderLabel} 广告位 ID`"><NInput v-model:value="ads.feed.placementId" /></NFormItem>
              <NFormItem label="每隔多少条内容插入"><NInputNumber v-model:value="ads.feed.insertEvery" :min="2" :max="50" class="w-full" /></NFormItem>
            </NCard>
          </NGridItem>
          <NGridItem>
            <NCard size="small" title="插全屏广告" embedded>
              <template #header-extra><NSwitch v-model:value="ads.fullScreen.enabled" :disabled="!canUpdate" /></template>
              <NFormItem :label="`${adProviderLabel} 广告位 ID`"><NInput v-model:value="ads.fullScreen.placementId" /></NFormItem>
              <NGrid :cols="2" :x-gap="12">
                <NGridItem><NFormItem label="播放次数阈值"><NInputNumber v-model:value="ads.fullScreen.playbackThreshold" :min="1" :max="100" class="w-full" /></NFormItem></NGridItem>
                <NGridItem><NFormItem label="最小间隔（分钟）"><NInputNumber v-model:value="ads.fullScreen.minimumIntervalMinutes" :min="1" :max="1440" class="w-full" /></NFormItem></NGridItem>
              </NGrid>
              <NFormItem label="加载超时（毫秒）"><NInputNumber v-model:value="ads.fullScreen.loadTimeoutMs" :min="2000" :max="30000" class="w-full" /></NFormItem>
              <NFormItem label="展示安全超时（毫秒）"><NInputNumber v-model:value="ads.fullScreen.showTimeoutMs" :min="30000" :max="600000" class="w-full" /></NFormItem>
            </NCard>
          </NGridItem>
          <NGridItem>
            <NCard size="small" title="激励视频" embedded>
              <template #header-extra><NSwitch v-model:value="ads.reward.enabled" :disabled="!canUpdate" /></template>
              <NFormItem :label="`${adProviderLabel} 广告位 ID`"><NInput v-model:value="ads.reward.placementId" /></NFormItem>
              <div class="text-sm leading-6 text-gray-500">这里只控制客户端请求。金币结算仍以服务端回调、风控和每日次数限制为准。</div>
            </NCard>
          </NGridItem>
        </NGrid>
        <div class="mt-5 flex justify-end"><NButton v-if="canUpdate" type="primary" :loading="savingAds" @click="saveAds">保存广告策略</NButton></div>
      </NCard>

      <NCard v-if="contentType === 'shortDrama'" title="短剧 SDK 播放与解锁">
        <NAlert type="warning" :bordered="false" class="mb-5">
          “平台安全模式”使用内容 SDK 内置广告，只负责解锁，不进入金币结算；“自有结算模式”使用当前广告平台、服务端回调和后台分成开关。App ID、安全密钥及 SDK 内置广告位来自安装包内签名配置，不能热更新。
        </NAlert>
        <NGrid cols="1 m:2 xl:3" responsive="screen" :x-gap="16" :y-gap="4">
          <NGridItem><NFormItem label="解锁广告模式"><NSelect v-model:value="shortDrama.unlockMode" :options="[{label:'自有结算模式（推荐）',value:'SPECIFIC'},{label:'SDK 平台安全模式',value:'COMMON'}]" /></NFormItem></NGridItem>
          <NGridItem><NFormItem label="免费集数"><NInputNumber v-model:value="shortDrama.freeEpisodes" :min="0" :max="1000" :precision="0" class="w-full" /></NFormItem></NGridItem>
          <NGridItem><NFormItem label="每次解锁集数"><NInputNumber v-model:value="shortDrama.unlockEpisodes" :min="1" :max="10" :precision="0" class="w-full" /></NFormItem></NGridItem>
        </NGrid>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div class="flex items-center justify-between rounded-lg border border-gray-700 px-4 py-3"><span>连续解锁</span><NSwitch v-model:value="shortDrama.continuousUnlock" /></div>
          <div class="flex items-center justify-between rounded-lg border border-gray-700 px-4 py-3"><span>隐藏 SDK 奖励弹窗</span><NSwitch v-model:value="shortDrama.hideRewardDialog" /></div>
          <div class="flex items-center justify-between rounded-lg border border-gray-700 px-4 py-3"><span>隐藏蜂窝网络提示</span><NSwitch v-model:value="shortDrama.hideCellularToast" /></div>
          <div class="flex items-center justify-between rounded-lg border border-gray-700 px-4 py-3"><span>允许无限滑动</span><NSwitch v-model:value="shortDrama.infiniteScrollEnabled" /></div>
          <div class="flex items-center justify-between rounded-lg border border-gray-700 px-4 py-3"><span>隐藏点赞按钮</span><NSwitch v-model:value="shortDrama.hideLikeButton" /></div>
          <div class="flex items-center justify-between rounded-lg border border-gray-700 px-4 py-3"><span>隐藏收藏按钮</span><NSwitch v-model:value="shortDrama.hideFavorButton" /></div>
          <div class="flex items-center justify-between rounded-lg border border-gray-700 px-4 py-3"><span>关闭双击点赞</span><NSwitch v-model:value="shortDrama.hideDoubleClick" /></div>
          <div class="flex items-center justify-between rounded-lg border border-gray-700 px-4 py-3"><span>关闭长按倍速</span><NSwitch v-model:value="shortDrama.hideLongClickSpeed" /></div>
        </div>
        <div class="mt-5 flex justify-end"><NButton v-if="canUpdate" type="primary" :loading="savingContent" @click="saveShortDrama">保存短剧 SDK 配置</NButton></div>
      </NCard>

      <NCard title="近 24 小时广告事件">
        <NGrid cols="1 s:2 xl:5" responsive="screen" :x-gap="16" :y-gap="12">
          <NGridItem v-for="item in metrics" :key="item.key">
            <NCard size="small" embedded>
              <NStatistic :label="item.label" :value="item.shows" />
              <div class="mt-3 flex justify-between text-xs text-gray-500"><span>请求 {{ item.requests }}</span><span>点击 {{ item.clicks }}</span><span :class="item.failures ? 'text-red-500' : ''">失败 {{ item.failures }}</span></div>
            </NCard>
          </NGridItem>
        </NGrid>
      </NCard>

      <NCard title="其他系统参数">
        <NDataTable
:data="rows" :columns="[
          {title:'配置键',key:'key'}, {title:'说明',key:'description'},
          {title:'类型',key:'type',render:(row:SystemConfig)=>h(NTag,{bordered:false},{default:()=>Array.isArray(row.value) ? '数组' : row.value === null ? '空值' : typeof row.value})},
          {title:'当前值',key:'value',ellipsis:{tooltip:true},render:(row:SystemConfig)=>JSON.stringify(row.value)},
          ...(canUpdate ? [{title:'操作',key:'actions',render:(row:SystemConfig)=>h(NButton,{size:'small',onClick:()=>open(row)},{default:()=> '编辑 JSON'})}] : []),
        ]"
/>
      </NCard>
    </div>
    <NModal v-model:show="visible" preset="card" :title="current?.key">
      <div class="mb-2 text-sm text-gray-500">配置说明</div><NInput v-model:value="description" class="mb-4" maxlength="255" show-count />
      <div class="mb-2 text-sm text-gray-500">JSON 值</div><NInput v-model:value="json" type="textarea" :rows="16" class="font-mono" />
      <template #footer><div class="flex justify-end gap-2"><NButton @click="visible = false">取消</NButton><NButton type="primary" @click="save">保存</NButton></div></template>
    </NModal>
  </Page>
</template>
