<script lang="ts" setup>
import type {
  ContentCenterDrama,
  ContentCenterResult,
  ContentProbeResult,
  SdkHealth,
  SdkHealthStatus,
} from '#/api';

import { computed, h, onMounted, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import {
  NAlert,
  NButton,
  NCard,
  NDataTable,
  NGi,
  NGrid,
  NImage,
  NInput,
  NSelect,
  NSpace,
  NStatistic,
  NTag,
  useMessage,
} from 'naive-ui';

import {
  getContentCenterApi,
  getSdkHealthApi,
  probePangleContentApi,
  syncPangleContentApi,
} from '#/api';
import { formatDateTime } from '#/utils/date-time';

defineOptions({ name: 'ContentCenter' });

const message = useMessage();
const { hasAccessByCodes } = useAccess();
const canUpdate = hasAccessByCodes(['operation:update']);
const contentLoading = ref(false);
const healthLoading = ref(false);
const probing = ref(false);
const syncing = ref(false);
const probeResult = ref<ContentProbeResult>();
const result = ref<ContentCenterResult>({
  list: [],
  page: 1,
  pageSize: 20,
  total: 0,
  summary: {
    invalidMappings: 0,
    latestPangleSyncAt: null,
    pangle: 0,
    published: 0,
    total: 0,
    validatedPangle: 0,
  },
});
const health = ref<SdkHealth>();
const filters = reactive({
  keyword: '',
  page: 1,
  pageSize: 20,
  provider: undefined as string | undefined,
  status: undefined as string | undefined,
});
const providerOptions = [
  { label: '穿山甲', value: 'PANGLE' },
  { label: '本地内容', value: 'LOCAL' },
];
const statusOptions = [
  { label: '已上架', value: 'PUBLISHED' },
  { label: '草稿', value: 'DRAFT' },
  { label: '已下架', value: 'OFFLINE' },
];
const statusText = { DRAFT: '草稿', OFFLINE: '已下架', PUBLISHED: '已上架' } as const;
const statusType = { DRAFT: 'warning', OFFLINE: 'default', PUBLISHED: 'success' } as const;
const healthText: Record<SdkHealthStatus, string> = {
  ERROR: '异常',
  HEALTHY: '正常',
  UNKNOWN: '待验证',
  WARNING: '需关注',
};
const healthType: Record<SdkHealthStatus, 'default' | 'error' | 'success' | 'warning'> = {
  ERROR: 'error',
  HEALTHY: 'success',
  UNKNOWN: 'default',
  WARNING: 'warning',
};
const mappingText = {
  INVALID: '映射缺失',
  NO_EPISODES: '无可用剧集',
  READY: '真机验证通过',
  READY_TO_VALIDATE: '待真机验证',
} as const;
const pagination = computed(() => ({
  itemCount: result.value.total,
  page: filters.page,
  pageSize: filters.pageSize,
  pageSizes: [20, 50, 100],
  showSizePicker: true,
  onChange: (page: number) => {
    filters.page = page;
    loadContent();
  },
  onUpdatePageSize: (pageSize: number) => {
    filters.page = 1;
    filters.pageSize = pageSize;
    loadContent();
  },
}));

async function loadContent() {
  contentLoading.value = true;
  try {
    result.value = await getContentCenterApi({
      page: filters.page,
      pageSize: filters.pageSize,
      ...(filters.keyword.trim() ? { keyword: filters.keyword.trim() } : {}),
      ...(filters.provider ? { provider: filters.provider } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    });
  } finally {
    contentLoading.value = false;
  }
}

async function loadHealth() {
  healthLoading.value = true;
  try {
    health.value = await getSdkHealthApi();
  } finally {
    healthLoading.value = false;
  }
}

async function probeContent() {
  probing.value = true;
  try {
    probeResult.value = await probePangleContentApi();
    if (probeResult.value.status === 'HEALTHY') message.success('内容接口探测通过');
    else message.error('内容接口探测失败');
  } finally {
    probing.value = false;
  }
}

async function syncContent() {
  syncing.value = true;
  try {
    const synced = await syncPangleContentApi();
    message.success(`已同步最新 ${synced.synced} 部短剧`);
    await Promise.all([loadContent(), loadHealth()]);
  } finally {
    syncing.value = false;
  }
}

function search() {
  filters.page = 1;
  loadContent();
}

function reset() {
  Object.assign(filters, {
    keyword: '',
    page: 1,
    provider: undefined,
    status: undefined,
  });
  loadContent();
}

function renderValidation(row: ContentCenterDrama) {
  if (row.provider !== 'PANGLE') {
    return h(NTag, { bordered: false, type: row.mappingStatus === 'READY' ? 'success' : 'error' }, {
      default: () => row.mappingStatus === 'READY' ? '本地剧集可用' : mappingText[row.mappingStatus],
    });
  }
  const validation = row.validation;
  return h('div', { class: 'validation-cell' }, [
    h(NTag, {
      bordered: false,
      type: row.mappingStatus === 'READY'
        ? 'success'
        : row.mappingStatus === 'READY_TO_VALIDATE' ? 'warning' : 'error',
    }, { default: () => mappingText[row.mappingStatus] }),
    validation
      ? h('div', { class: 'validation-meta' }, [
          h('div', `通过时间：${formatDateTime(validation.playbackStartedAt!)}`),
          h('div', `${validation.deviceModel || '未知设备'} · ${validation.abi || '未知 ABI'}`),
          h('div', `SDK ${validation.sdkVersion || '未知'} · App ${validation.appVersion || '未知'}`),
        ])
      : h('div', { class: 'validation-tip' }, '需在 ARM 真机中实际开始播放'),
  ]);
}

const columns = [
  {
    title: '封面',
    key: 'coverUrl',
    width: 84,
    render: (row: ContentCenterDrama) => h(NImage, {
      src: row.coverUrl,
      width: 48,
      height: 68,
      objectFit: 'cover',
      style: 'border-radius: 8px',
    }),
  },
  {
    title: '短剧',
    key: 'title',
    minWidth: 260,
    render: (row: ContentCenterDrama) => h('div', [
      h('div', { class: 'content-title' }, row.title),
      h('div', { class: 'content-meta' }, `本地 ID ${row.id} · 内容 ID ${row.externalId || '缺失'}`),
    ]),
  },
  {
    title: '来源',
    key: 'provider',
    width: 95,
    render: (row: ContentCenterDrama) => h(NTag, {
      bordered: false,
      type: row.provider === 'PANGLE' ? 'info' : 'default',
    }, { default: () => row.provider === 'PANGLE' ? '穿山甲' : '本地' }),
  },
  { title: '分类', key: 'category', width: 110 },
  {
    title: '集数',
    key: 'episodes',
    width: 80,
    render: (row: ContentCenterDrama) => row.provider === 'PANGLE'
      ? row.externalEpisodeCount
      : row._count.episodes,
  },
  {
    title: '状态',
    key: 'status',
    width: 90,
    render: (row: ContentCenterDrama) => h(NTag, {
      bordered: false,
      type: statusType[row.status],
    }, { default: () => statusText[row.status] }),
  },
  { title: '播放验证', key: 'mappingStatus', width: 250, render: renderValidation },
  {
    title: '业务数据',
    key: 'metrics',
    width: 150,
    render: (row: ContentCenterDrama) => `收藏 ${row._count.favorites} · 历史 ${row._count.histories}`,
  },
  {
    title: '最近同步',
    key: 'updatedAt',
    width: 175,
    render: (row: ContentCenterDrama) => formatDateTime(row.updatedAt),
  },
];

onMounted(() => {
  loadContent();
  loadHealth();
});
</script>

<template>
  <Page
    title="短剧内容中心"
    description="查看内容快照、第三方 ID 映射，以及穿山甲内容和广告服务运行状态"
  >
    <NGrid cols="1 s:2 l:3 xl:6" responsive="screen" :x-gap="16" :y-gap="16">
      <NGi
        v-for="item in [
          { label: '短剧总数', value: result.summary.total },
          { label: '已上架', value: result.summary.published },
          { label: '穿山甲内容', value: result.summary.pangle },
          { label: '已真机验证', value: result.summary.validatedPangle },
          { label: '异常映射', value: result.summary.invalidMappings },
          { label: '最近同步', value: result.summary.latestPangleSyncAt ? formatDateTime(result.summary.latestPangleSyncAt) : '尚未同步' },
        ]"
        :key="item.label"
      >
        <NCard size="small"><NStatistic :label="item.label" :value="item.value" /></NCard>
      </NGi>
    </NGrid>

    <NCard class="mt-4" title="SDK 与服务状态" :loading="healthLoading">
      <template #header-extra>
        <NSpace>
          <NButton :loading="probing" secondary type="primary" @click="probeContent">
            实时探测内容接口
          </NButton>
          <NButton :loading="healthLoading" @click="loadHealth">刷新状态</NButton>
        </NSpace>
      </template>
      <NAlert
        v-if="health"
        class="mb-4"
        :type="health.overall === 'HEALTHY' ? 'success' : health.overall === 'DEGRADED' ? 'error' : 'warning'"
        :title="health.overall === 'HEALTHY' ? '服务配置正常' : health.overall === 'DEGRADED' ? '存在阻断项' : '部分状态需要确认'"
      >
        原生播放器只有在 ARM 真机收到内容并实际开始播放后，才会记录为验证通过。
      </NAlert>
      <NAlert
        v-if="probeResult"
        class="mb-4"
        :type="probeResult.status === 'HEALTHY' ? 'success' : 'error'"
        :title="probeResult.status === 'HEALTHY' ? '内容接口连通' : '内容接口不可用'"
        closable
        @close="probeResult = undefined"
      >
        耗时 {{ probeResult.latencyMs }} ms，分类数 {{ probeResult.categoryCount }}
        <span v-if="probeResult.message">，{{ probeResult.message }}</span>
      </NAlert>
      <NGrid v-if="health" cols="1 m:2 xl:3" responsive="screen" :x-gap="12" :y-gap="12">
        <NGi v-for="check in health.checks" :key="check.code">
          <div class="health-item">
            <div class="health-heading">
              <strong>{{ check.name }}</strong>
              <NTag size="small" :bordered="false" :type="healthType[check.status]">
                {{ healthText[check.status] }}
              </NTag>
            </div>
            <div class="health-detail">{{ check.detail }}</div>
          </div>
        </NGi>
      </NGrid>
    </NCard>

    <NCard class="mt-4" title="内容快照">
      <template #header-extra>
        <NButton
          v-if="canUpdate"
          secondary
          type="primary"
          :loading="syncing"
          @click="syncContent"
        >
          同步最新 50 部
        </NButton>
      </template>
      <div class="filters">
        <NInput
          v-model:value="filters.keyword"
          clearable
          placeholder="搜索剧名、内容 ID 或分类"
          class="keyword"
          @keyup.enter="search"
        />
        <NSelect
          v-model:value="filters.provider"
          clearable
          placeholder="全部来源"
          :options="providerOptions"
          class="filter-select"
        />
        <NSelect
          v-model:value="filters.status"
          clearable
          placeholder="全部状态"
          :options="statusOptions"
          class="filter-select"
        />
        <NButton type="primary" @click="search">查询</NButton>
        <NButton @click="reset">重置</NButton>
      </div>
      <NDataTable
        remote
        :columns="columns"
        :data="result.list"
        :loading="contentLoading"
        :pagination="pagination"
        :scroll-x="1450"
      />
    </NCard>
  </Page>
</template>

<style scoped>
.filters { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
.keyword { width: min(360px, 100%); }
.filter-select { width: 150px; }
.health-item { height: 100%; padding: 14px; border: 1px solid var(--n-border-color); border-radius: 10px; background: var(--n-color-embedded); }
.health-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.health-detail { margin-top: 8px; color: var(--n-text-color-3); font-size: 12px; line-height: 1.6; }
:deep(.content-title) { font-weight: 600; }
:deep(.content-meta) { margin-top: 5px; color: var(--n-text-color-3); font-size: 12px; }
:deep(.validation-cell) { display: flex; flex-direction: column; align-items: flex-start; gap: 7px; padding: 5px 0; }
:deep(.validation-meta), :deep(.validation-tip) { color: var(--n-text-color-3); font-size: 12px; line-height: 1.55; }
@media (max-width: 640px) { .keyword, .filter-select { width: 100%; } }
</style>
