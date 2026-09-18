<script lang="ts" setup>
import type { DataTableColumns } from 'naive-ui';

import type { AdCallbackLog, AdCallbackSummary, AdRewardSettlement } from '#/api';

import { onMounted, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import { NAlert, NCard, NDataTable, NGrid, NGridItem, NPagination, NStatistic, NTabPane, NTabs } from 'naive-ui';

import { getAdCallbackLogsApi, getAdRewardDashboardApi, getAdRewardSettlementsApi } from '#/api';
import { formatDateTime } from '#/utils/date-time';

defineOptions({ name: 'AdRewardSettlements' });
const loading = ref(false);
const { hasAccessByCodes } = useAccess();
const dashboard = ref<Awaited<ReturnType<typeof getAdRewardDashboardApi>>>();
const settlements = ref<AdRewardSettlement[]>([]);
const callbacks = ref<AdCallbackLog[]>([]);
const callbackSummary = ref<AdCallbackSummary>({ failed: 0, processing: 0, staleProcessing: 0, success: 0 });
const page = reactive({ current: 1, size: 20, total: 0 });
const settlementColumns: DataTableColumns<AdRewardSettlement> = [
  { title: '结算时间', key: 'createdAt', render: (row) => formatDateTime(row.createdAt) },
  { title: '用户', key: 'user', render: (row) => `${row.user.nickname} (${row.user.phone})` },
  { title: '广告收入(元)', key: 'revenueMicros', render: (row) => (Number(row.revenueMicros) / 1_000_000).toFixed(6) },
  { title: '用户完整收益', key: 'awardedCoins' }, { title: '平台直推佣金', key: 'directAwardedCoins' }, { title: '平台间推佣金', key: 'indirectAwardedCoins' },
  { title: '平台代理佣金', key: 'agentCommissions', render: (row) => String(row.agentCommissions.reduce((sum, item) => sum + BigInt(item.awardedCoins), 0n)) },
  { title: '来源', key: 'source' }, { title: '幂等号', key: 'requestId', ellipsis: { tooltip: true } },
];
const callbackColumns: DataTableColumns<AdCallbackLog> = [
  { title: '接收时间', key: 'createdAt', render: (row) => formatDateTime(row.createdAt) },
  { title: '最后更新', key: 'updatedAt', render: (row) => formatDateTime(row.updatedAt) },
  { title: '事件号', key: 'eventId', ellipsis: { tooltip: true } },
  { title: '状态', key: 'status', render: (row) => row.status === 'SUCCESS' ? '成功' : row.status === 'FAILED' ? '失败' : '处理中' },
  { title: '来源 IP', key: 'ip' }, { title: '失败原因', key: 'reason', ellipsis: { tooltip: true } },
];
async function load() {
  loading.value = true;
  try {
    const [stats, rows, logs] = await Promise.all([
      getAdRewardDashboardApi(),
      getAdRewardSettlementsApi({ page: page.current, pageSize: page.size }),
      hasAccessByCodes(['reward:update'])
        ? getAdCallbackLogsApi({ page: 1, pageSize: 50 })
        : Promise.resolve({ list: [], summary: { failed: 0, processing: 0, staleProcessing: 0, success: 0 } }),
    ]);
    dashboard.value = stats;
    settlements.value = rows.list;
    page.total = rows.total;
    callbacks.value = logs.list;
    callbackSummary.value = logs.summary;
  } finally {
    loading.value = false;
  }
}
onMounted(load);
</script>
<template>
  <Page title="广告收益" description="查看广告收入、用户完整收益、两级返佣、无限下级代理佣金及平台回调结果">
    <NGrid v-if="dashboard" :cols="6" :x-gap="12" responsive="screen" class="mb-4">
      <NGridItem><NCard><NStatistic label="结算笔数" :value="dashboard.count" /></NCard></NGridItem>
      <NGridItem><NCard><NStatistic label="广告收入(元)" :value="(Number(dashboard.revenueMicros) / 1_000_000).toFixed(2)" /></NCard></NGridItem>
      <NGridItem><NCard><NStatistic label="用户完整收益" :value="dashboard.awardedCoins" /></NCard></NGridItem>
      <NGridItem><NCard><NStatistic label="平台两级返佣" :value="String(BigInt(dashboard.directAwardedCoins) + BigInt(dashboard.indirectAwardedCoins))" /></NCard></NGridItem>
      <NGridItem><NCard><NStatistic label="平台代理佣金" :value="dashboard.agentAwardedCoins" /></NCard></NGridItem>
      <NGridItem><NCard><NStatistic label="平台结余(金币等值)" :value="dashboard.platformRetainedCoins" /></NCard></NGridItem>
    </NGrid>
    <NCard>
      <NTabs type="line">
        <NTabPane name="settlements" tab="结算记录">
          <NDataTable :columns="settlementColumns" :data="settlements" :loading="loading" />
          <div class="mt-4 flex justify-end">
            <NPagination v-model:page="page.current" :item-count="page.total" :page-size="page.size" @update:page="load" />
          </div>
        </NTabPane>
        <NTabPane v-if="hasAccessByCodes(['reward:update'])" name="callbacks" tab="回调日志">
          <NAlert v-if="callbackSummary.failed || callbackSummary.staleProcessing" :type="callbackSummary.staleProcessing ? 'error' : 'warning'" class="mb-4" title="广告奖励回调需要关注">
            <span v-if="callbackSummary.failed">有 {{ callbackSummary.failed }} 条失败回调。</span>
            <span v-if="callbackSummary.staleProcessing">有 {{ callbackSummary.staleProcessing }} 条处理超过 5 分钟，请检查服务日志与结算记录。</span>
          </NAlert>
          <NGrid :cols="4" :x-gap="12" responsive="screen" class="mb-4">
            <NGridItem><NCard size="small"><NStatistic label="成功" :value="callbackSummary.success" /></NCard></NGridItem>
            <NGridItem><NCard size="small"><NStatistic label="失败" :value="callbackSummary.failed" /></NCard></NGridItem>
            <NGridItem><NCard size="small"><NStatistic label="处理中" :value="callbackSummary.processing" /></NCard></NGridItem>
            <NGridItem><NCard size="small"><NStatistic label="超时处理中" :value="callbackSummary.staleProcessing" /></NCard></NGridItem>
          </NGrid>
          <NDataTable :columns="callbackColumns" :data="callbacks" :loading="loading" />
        </NTabPane>
      </NTabs>
    </NCard>
  </Page>
</template>
