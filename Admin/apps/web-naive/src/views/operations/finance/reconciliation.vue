<script lang="ts" setup>
import type { DataTableColumns } from 'naive-ui';
import type { ReconciliationIssue, ReconciliationRun, ReconciliationSchedule } from '#/api';

import { h, onMounted, ref } from 'vue';
import { Page } from '@vben/common-ui';
import { NButton, NCard, NDataTable, NInputNumber, NSwitch, NTag, useMessage } from 'naive-ui';

import {
  getReconciliationRunsApi,
  getReconciliationScheduleApi,
  runReconciliationApi,
  updateReconciliationScheduleApi,
} from '#/api';
import { formatDateTime } from '#/utils/date-time';

defineOptions({ name: 'ReconciliationRuns' });

const message = useMessage();
const loading = ref(false);
const running = ref(false);
const rows = ref<ReconciliationRun[]>([]);
const savingSchedule = ref(false);
const schedule = ref<ReconciliationSchedule>({ enabled: true, hour: 3, minute: 0, timezone: 'Asia/Shanghai' });

const statusMeta = {
  FAILED: { label: '发现差异', type: 'error' as const },
  PASSED: { label: '对账通过', type: 'success' as const },
  RUNNING: { label: '执行中', type: 'warning' as const },
};

const issueColumns: DataTableColumns<ReconciliationIssue> = [
  { key: 'userId', title: '用户 ID' },
  {
    key: 'type',
    title: '差异类型',
    render: (row) =>
      row.type === 'AVAILABLE_COIN' ? '可用金币' : '冻结金币',
  },
  { key: 'actualAmount', title: '实际余额' },
  { key: 'expectedAmount', title: '流水应有余额' },
  {
    key: 'difference',
    title: '差额',
    render: (row) =>
      h(
        NTag,
        { type: row.difference === '0' ? 'success' : 'error' },
        { default: () => row.difference },
      ),
  },
];

const columns: DataTableColumns<ReconciliationRun> = [
  {
    type: 'expand',
    expandable: (row) => row.issues.length > 0,
    renderExpand: (row) =>
      h(NDataTable, {
        columns: issueColumns,
        data: row.issues,
        pagination: false,
      }),
  },
  {
    key: 'source',
    title: '来源',
    width: 90,
    render: (row) => (row.source === 'SCHEDULED' ? '自动' : '手动'),
  },
  {
    key: 'status',
    title: '状态',
    width: 110,
    render: (row) => {
      const meta = statusMeta[row.status];
      return h(NTag, { type: meta.type }, { default: () => meta.label });
    },
  },
  { key: 'checkedUsers', title: '检查用户', width: 100 },
  { key: 'issueCount', title: '差异数', width: 90 },
  {
    key: 'startedAt',
    title: '开始时间',
    render: (row) => formatDateTime(row.startedAt),
  },
  {
    key: 'completedAt',
    title: '完成时间',
    render: (row) =>
      formatDateTime(row.completedAt),
  },
  {
    key: 'errorMessage',
    title: '执行错误',
    render: (row) => row.errorMessage || '-',
  },
];

/** 刷新最近 50 次对账记录，异常由统一请求层提示。 */
async function load() {
  loading.value = true;
  try {
    rows.value = await getReconciliationRunsApi();
  } finally {
    loading.value = false;
  }
}

/** 读取数据库中的调度配置；配置不存在时继续使用安全默认值。 */
async function loadSchedule() {
  schedule.value = await getReconciliationScheduleApi();
}

/** 保存后调度器会在下一次分钟检查时自动读取，无需重启服务。 */
async function saveSchedule() {
  savingSchedule.value = true;
  try {
    await updateReconciliationScheduleApi(schedule.value);
    message.success('自动对账配置已保存');
  } finally {
    savingSchedule.value = false;
  }
}

/** 手动对账只生成检查记录与风险事件，不会自动修正任何余额。 */
async function runNow() {
  if (!window.confirm('确认立即执行资金对账？该操作不会修改用户余额。')) return;
  running.value = true;
  try {
    const result = await runReconciliationApi();
    result.issueCount
      ? message.warning(`对账完成，发现 ${result.issueCount} 条差异`)
      : message.success('对账完成，全部余额一致');
    await load();
  } finally {
    running.value = false;
  }
}

onMounted(() => Promise.all([load(), loadSchedule()]));
</script>

<template>
  <Page
    title="资金对账"
    description="核对用户可用/冻结金币与不可变流水、处理中提现订单；仅记录差异，不自动调账"
  >
    <NCard class="mb-4" title="自动对账配置">
      <div class="flex flex-wrap items-center gap-4">
        <span>启用</span><NSwitch v-model:value="schedule.enabled" />
        <span>每天</span>
        <NInputNumber v-model:value="schedule.hour" :min="0" :max="23" class="w-28" />
        <span>时</span>
        <NInputNumber v-model:value="schedule.minute" :min="0" :max="59" class="w-28" />
        <span>分（Asia/Shanghai）</span>
        <NButton type="primary" :loading="savingSchedule" @click="saveSchedule">保存配置</NButton>
      </div>
    </NCard>
    <NCard>
      <div class="mb-4 flex justify-end">
        <NButton type="primary" :loading="running" @click="runNow">
          立即对账
        </NButton>
      </div>
      <NDataTable
        :columns="columns"
        :data="rows"
        :loading="loading"
        :row-key="(row: ReconciliationRun) => row.id"
      />
    </NCard>
  </Page>
</template>
