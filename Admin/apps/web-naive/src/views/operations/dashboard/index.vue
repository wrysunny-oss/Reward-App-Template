<script lang="ts" setup>
import type { EchartsUIType } from '@vben/plugins/echarts';
import type { AgentOverview, DashboardStats } from '#/api';

import { nextTick, onMounted, ref } from 'vue';
import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { EchartsUI, useEcharts } from '@vben/plugins/echarts';
import { NAlert, NCard, NDataTable, NEmpty, NGi, NGrid, NProgress, NSkeleton, NStatistic, NTag } from 'naive-ui';
import { getAgentOverviewApi, getDashboardApi } from '#/api';

defineOptions({ name: 'DashboardOverview' });
const loading = ref(true);
const { hasAccessByCodes } = useAccess();
const isReadonlyAgent = hasAccessByCodes(['agent:readonly']);
const brandName = import.meta.env.VITE_APP_BRAND_NAME || '富商剧场';
const stats = ref<DashboardStats>({
  coinsIssued: '0', dramaStatusDistribution: [], feedbackPending: 0,
  publishedDramas: 0, reconciliationPending: 0,
  today: { adRevenueMicros: '0', adSettlements: 0, awardedCoins: '0', newUsers: 0 },
  trend: [], userStatusDistribution: [], users: 0,
});
const agentOverview = ref<AgentOverview>();
const trendChartRef = ref<EchartsUIType>();
const distributionChartRef = ref<EchartsUIType>();
const { renderEcharts: renderTrendChart } = useEcharts(trendChartRef);
const { renderEcharts: renderDistributionChart } = useEcharts(distributionChartRef);
const yuan = (micros: string) => (Number(micros) / 1_000_000).toFixed(2);
const numberText = (value: string | number) => Number(value).toLocaleString('zh-CN');
const userStatusText = { ACTIVE: '正常用户', DISABLED: '已禁用' } as const;
const dramaStatusText = { DRAFT: '草稿', OFFLINE: '已下架', PUBLISHED: '已上架' } as const;

function renderAdminCharts() {
  const trend = stats.value.trend;
  renderTrendChart({
    color: ['#18a058', '#2080f0', '#f0a020'],
    grid: { bottom: 24, containLabel: true, left: 16, right: 22, top: 52 },
    legend: { top: 6 },
    series: [
      { barMaxWidth: 24, data: trend.map((item) => item.newUsers), name: '新增用户', type: 'bar' },
      { data: trend.map((item) => item.adSettlements), name: '广告结算次数', smooth: true, symbolSize: 7, type: 'line' },
      { data: trend.map((item) => Number(item.awardedCoins)), name: '广告发放金币', smooth: true, symbolSize: 7, type: 'line', yAxisIndex: 1 },
    ],
    tooltip: { trigger: 'axis' },
    xAxis: { axisTick: { show: false }, boundaryGap: true, data: trend.map((item) => item.date), type: 'category' },
    yAxis: [
      { minInterval: 1, name: '人数 / 次数', splitLine: { lineStyle: { type: 'dashed' } }, type: 'value' },
      { minInterval: 1, name: '金币', splitLine: { show: false }, type: 'value' },
    ],
  });
  renderDistributionChart({
    color: ['#18a058', '#d03050', '#2080f0', '#f0a020', '#8a8a8a'],
    graphic: [
      { left: '20%', style: { fontSize: 13, text: '用户状态' }, top: '42%', type: 'text' },
      { left: '70%', style: { fontSize: 13, text: '短剧状态' }, top: '42%', type: 'text' },
    ],
    legend: { bottom: 0, type: 'scroll' },
    series: [
      {
        center: ['25%', '43%'],
        data: stats.value.userStatusDistribution.map((item) => ({ name: userStatusText[item.status], value: item.count })),
        label: { fontSize: 11, formatter: '{b}\n{c}' }, name: '用户状态', radius: ['40%', '62%'], type: 'pie',
      },
      {
        center: ['75%', '43%'],
        data: stats.value.dramaStatusDistribution.map((item) => ({ name: dramaStatusText[item.status], value: item.count })),
        label: { fontSize: 11, formatter: '{b}\n{c}' }, name: '短剧状态', radius: ['40%', '62%'], type: 'pie',
      },
    ],
    tooltip: { formatter: '{b}：{c}（{d}%）', trigger: 'item' },
  });
}

onMounted(async () => {
  try {
    if (isReadonlyAgent) agentOverview.value = await getAgentOverviewApi();
    else {
      stats.value = await getDashboardApi();
      await nextTick();
      renderAdminCharts();
    }
  } finally { loading.value = false; }
});
</script>

<template>
  <Page :title="isReadonlyAgent ? '代理概览' : '运营概览'" :description="isReadonlyAgent ? '仅统计自己邀请树下的全部成员数据' : `${brandName}核心业务数据`">
    <NAlert v-if="!isReadonlyAgent && (stats.reconciliationPending > 0 || stats.latestReconciliation?.status === 'FAILED')" class="mb-4" title="发现资金对账异常" type="error">
      当前有 {{ stats.reconciliationPending }} 个待处理对账风险事件，请前往“资金管理 → 资金对账”核查差异。
    </NAlert>

    <NGrid v-if="isReadonlyAgent && agentOverview" cols="1 s:2 l:4" responsive="screen" :x-gap="16" :y-gap="16">
      <NGi v-for="item in [
        { label: '下级成员', value: agentOverview.members.total }, { label: '今日新增成员', value: agentOverview.members.today },
        { label: '30 日活跃成员', value: agentOverview.members.active30Days }, { label: '今日广告收入（元）', value: yuan(agentOverview.ads.today.revenueMicros) },
        { label: '本月广告收入（元）', value: yuan(agentOverview.ads.month.revenueMicros) }, { label: '今日代理佣金', value: agentOverview.commission.today },
        { label: '本月代理佣金', value: agentOverview.commission.month }, { label: '累计代理佣金', value: agentOverview.commission.total },
      ]" :key="item.label">
        <NCard><NStatistic :label="item.label" :value="item.value" /></NCard>
      </NGi>
    </NGrid>

    <template v-else>
      <NGrid cols="1 s:2 l:4" responsive="screen" :x-gap="16" :y-gap="16">
        <NGi v-for="item in [
          { label: '注册用户', value: numberText(stats.users) }, { label: '已上架短剧', value: numberText(stats.publishedDramas) },
          { label: '累计发放金币', value: numberText(stats.coinsIssued) }, { label: '今日广告收入（元）', value: yuan(stats.today.adRevenueMicros) },
        ]" :key="item.label">
          <NCard class="metric-card"><NSkeleton v-if="loading" text :repeat="2" /><NStatistic v-else :label="item.label" :value="item.value" /></NCard>
        </NGi>
      </NGrid>

      <NGrid class="mt-4" cols="1 s:2 l:4" responsive="screen" :x-gap="16" :y-gap="16">
        <NGi v-for="item in [
          { label: '今日新增用户', value: stats.today.newUsers, type: 'info' },
          { label: '今日广告结算', value: stats.today.adSettlements, type: 'success' },
          { label: '今日发放金币', value: numberText(stats.today.awardedCoins), type: 'warning' },
          { label: '待处理反馈', value: stats.feedbackPending, type: stats.feedbackPending ? 'error' : 'default' },
        ]" :key="item.label">
          <NCard size="small" class="today-card">
            <div class="today-card-label">{{ item.label }}</div><div class="today-card-value">{{ item.value }}</div>
            <NTag :type="item.type as any" size="small" :bordered="false">今日</NTag>
          </NCard>
        </NGi>
      </NGrid>

      <NGrid class="mt-4" cols="1 l:3" responsive="screen" :x-gap="16" :y-gap="16">
        <NGi span="1 l:2">
          <NCard title="近 7 日业务趋势" class="chart-card">
            <template #header-extra><NTag :bordered="false">北京时间</NTag></template>
            <EchartsUI v-if="stats.trend.length" ref="trendChartRef" class="dashboard-chart" />
            <NEmpty v-else description="暂无趋势数据" class="empty-chart" />
          </NCard>
        </NGi>
        <NGi>
          <NCard title="业务构成" class="chart-card">
            <EchartsUI v-if="stats.userStatusDistribution.length || stats.dramaStatusDistribution.length" ref="distributionChartRef" class="dashboard-chart" />
            <NEmpty v-else description="暂无构成数据" class="empty-chart" />
          </NCard>
        </NGi>
      </NGrid>

      <NCard title="运营待办" class="mt-4">
        <NGrid cols="1 m:3" responsive="screen" :x-gap="28" :y-gap="18">
          <NGi>
            <div class="todo-title"><span>用户反馈</span><strong>{{ stats.feedbackPending }}</strong></div>
            <NProgress type="line" :percentage="stats.feedbackPending ? 100 : 0" :show-indicator="false" status="warning" />
            <div class="todo-description">{{ stats.feedbackPending ? '存在等待回复的用户反馈' : '当前没有待处理反馈' }}</div>
          </NGi>
          <NGi>
            <div class="todo-title"><span>资金对账异常</span><strong>{{ stats.reconciliationPending }}</strong></div>
            <NProgress type="line" :percentage="stats.reconciliationPending ? 100 : 0" :show-indicator="false" status="error" />
            <div class="todo-description">{{ stats.reconciliationPending ? '需要核查账户余额与流水差异' : '当前没有待处理差异' }}</div>
          </NGi>
          <NGi>
            <div class="todo-title"><span>最近对账状态</span><NTag size="small" :type="stats.latestReconciliation?.status === 'PASSED' ? 'success' : stats.latestReconciliation?.status === 'RUNNING' ? 'info' : stats.latestReconciliation?.status === 'FAILED' ? 'error' : 'default'">
              {{ stats.latestReconciliation?.status === 'PASSED' ? '通过' : stats.latestReconciliation?.status === 'RUNNING' ? '进行中' : stats.latestReconciliation?.status === 'FAILED' ? '失败' : '未执行' }}
            </NTag></div>
            <NProgress type="line" :percentage="stats.latestReconciliation?.status === 'PASSED' ? 100 : 0" :show-indicator="false" :status="stats.latestReconciliation?.status === 'FAILED' ? 'error' : 'success'" />
            <div class="todo-description">最近一次资金一致性检查结果</div>
          </NGi>
        </NGrid>
      </NCard>
    </template>

    <NGrid v-if="isReadonlyAgent && agentOverview" class="mt-4" cols="1 l:2" responsive="screen" :x-gap="16" :y-gap="16">
      <NGi><NCard title="近 7 日广告收益趋势"><NDataTable :data="agentOverview.trend" :columns="[
        { title: '日期', key: 'date' }, { title: '结算次数', key: 'count' },
        { title: '广告收入（元）', key: 'revenueMicros', render: (row: any) => yuan(row.revenueMicros) }, { title: '用户收益金币', key: 'awardedCoins' },
      ]" /></NCard></NGi>
      <NGi><NCard title="下级成员广告贡献排行"><NDataTable :data="agentOverview.ranking" :columns="[
        { title: '成员', key: 'user', render: (row: any) => row.user ? `${row.user.nickname} (${row.user.phone})` : '-' }, { title: '次数', key: 'count' },
        { title: '广告收入（元）', key: 'revenueMicros', render: (row: any) => yuan(row.revenueMicros) }, { title: '所得金币', key: 'awardedCoins' },
      ]" /></NCard></NGi>
    </NGrid>
  </Page>
</template>

<style scoped>
.metric-card { min-height: 108px; }
.today-card :deep(.n-card__content) { display: grid; grid-template-columns: 1fr auto; align-items: center; }
.today-card-label { color: var(--n-text-color-3); font-size: 13px; }
.today-card-value { margin-top: 6px; font-size: 22px; font-weight: 600; }
.today-card .n-tag { grid-column: 2; grid-row: 1 / 3; }
.chart-card { height: 390px; }
.dashboard-chart { height: 310px; }
.empty-chart { padding-top: 100px; }
.todo-title { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.todo-title strong { font-size: 18px; }
.todo-description { margin-top: 8px; color: var(--n-text-color-3); font-size: 12px; }
</style>
