<script lang="ts" setup>
import type { DataTableColumns } from 'naive-ui';
import type { AlipayPayoutStatus, WithdrawalBatch, WithdrawalBatchResultRow, WithdrawalStatus } from '#/api';

import { computed, h, onMounted, onUnmounted, ref } from 'vue';
import { Page } from '@vben/common-ui';
import { NAlert, NButton, NCard, NDataTable, NGi, NGrid, NModal, NStatistic, NTag, useMessage } from 'naive-ui';

import {
  confirmWithdrawalBatchResultsApi,
  closeWithdrawalBatchApi,
  exportWithdrawalBatchApi,
  getAlipayPayoutStatusApi,
  getFinanceDashboardApi,
  getWithdrawalBatchesApi,
  previewWithdrawalBatchResultsApi,
  queryAlipayWithdrawalBatchApi,
  startAlipayWithdrawalBatchApi,
} from '#/api';
import { businessStatusText, businessStatusType } from '#/utils/business-status';
import { formatDateTime } from '#/utils/date-time';

defineOptions({ name: 'WithdrawalBatches' });
const message = useMessage();
const loading = ref(false);
const batchActionId = ref('');
const rows = ref<WithdrawalBatch[]>([]);
const alipayStatus = ref<AlipayPayoutStatus>();
const actionVisible = ref(false);
const actionBatch = ref<WithdrawalBatch>();
const actionMode = ref<'PAY' | 'QUERY'>('PAY');
let refreshTimer: ReturnType<typeof setInterval> | undefined;
const dashboard = ref<{ abnormalBatches: number; byStatus: Array<{ _count: number; _sum: { actualCents: null | number }; status: WithdrawalStatus }>; timeoutCount: number; today: { cents: number; count: number } }>({ abnormalBatches: 0, byStatus: [], timeoutCount: 0, today: { cents: 0, count: 0 } });
const importVisible = ref(false);
const activeBatch = ref<WithdrawalBatch>();
const resultRows = ref<WithdrawalBatchResultRow[]>([]);
const preview = ref<{ invalid: number; rows: Array<WithdrawalBatchResultRow & { errors: string[]; valid: boolean }> }>();
const resultRequestId = ref('');
const statusMap = computed(() => Object.fromEntries(dashboard.value.byStatus.map((item: any) => [item.status, item])) as Record<string, any>);
const completed = computed(() => statusMap.value.COMPLETED?._count ?? 0);
const failed = computed(() => statusMap.value.FAILED?._count ?? 0);
const successRate = computed(() => completed.value + failed.value ? `${(completed.value * 100 / (completed.value + failed.value)).toFixed(1)}%` : '0%');
const itemColumns: DataTableColumns<WithdrawalBatch['items'][number]> = [
  { title: '提现订单', key: 'withdrawal', render: (item) => item.withdrawal.id },
  { title: '用户', key: 'user', render: (item) => `${item.withdrawal.user.nickname} (${item.withdrawal.user.phone})` },
  { title: '订单状态', key: 'withdrawalStatus', render: (item) => businessStatusText(item.withdrawal.status) },
  { title: '打款结果', key: 'status', render: (item) => h(NTag, { type: businessStatusType(item.status) }, { default: () => businessStatusText(item.status) }) },
  { title: '支付宝流水号', key: 'paymentReference', render: (item) => item.paymentReference || '-' },
  { title: '处理说明', key: 'failureReason', ellipsis: { tooltip: true }, render: (item) => item.failureReason || '-' },
];

function pendingCount(row: WithdrawalBatch) {
  return row.items.filter((item) => item.status === 'PENDING').length;
}

function openBatchAction(row: WithdrawalBatch, mode: 'PAY' | 'QUERY') {
  actionBatch.value = row;
  actionMode.value = mode;
  actionVisible.value = true;
}

const columns: DataTableColumns<WithdrawalBatch> = [
  { type: 'expand', renderExpand: (row) => h(NDataTable, { columns: itemColumns, data: row.items, pagination: false }) },
  { key: 'batchNo', title: '批次号', width: 220 },
  { key: 'createdAt', title: '创建时间', width: 190, render: (row) => formatDateTime(row.createdAt) },
  { key: 'orderCount', title: '订单数', width: 90 },
  { key: 'totalCents', title: '批次金额', width: 120, render: (row) => `¥${(row.totalCents / 100).toFixed(2)}` },
  { key: 'status', title: '状态', width: 110, render: (row) => h(NTag, { type: businessStatusType(row.status) }, { default: () => businessStatusText(row.status) }) },
  { key: 'progress', title: '进度', width: 130, render: (row) => `${row.orderCount - pendingCount(row)} / ${row.orderCount}` },
  { key: 'actions', title: '操作', width: 430, render: (row) => h('div', { class: 'flex flex-wrap gap-2' }, [
    h(NButton, { size: 'small', onClick: () => download(row) }, { default: () => '导出 CSV' }),
    ...(['DRAFT', 'EXPORTED', 'PROCESSING', 'PARTIAL'].includes(row.status) && pendingCount(row) > 0 ? [h(NButton, {
      disabled: !alipayStatus.value?.configured,
      loading: batchActionId.value === row.id,
      size: 'small',
      type: 'primary',
      onClick: () => openBatchAction(row, 'PAY'),
    }, { default: () => row.status === 'PROCESSING' ? '继续支付宝打款' : '支付宝批量打款' })] : []),
    ...(['PROCESSING', 'PARTIAL'].includes(row.status) && pendingCount(row) > 0 ? [h(NButton, {
      disabled: !alipayStatus.value?.configured,
      loading: batchActionId.value === row.id,
      size: 'small',
      onClick: () => openBatchAction(row, 'QUERY'),
    }, { default: () => '批量查单' })] : []),
    ...(row.status === 'DRAFT' || row.status === 'EXPORTED' ? [h(NButton, { size: 'small', type: 'primary', onClick: () => openImport(row) }, { default: () => '导入结果' })] : []),
    ...(row.status === 'DRAFT' || row.status === 'EXPORTED' ? [h(NButton, { size: 'small', type: 'error', onClick: () => closeBatch(row) }, { default: () => '关闭' })] : []),
  ]) },
];

async function load() {
  loading.value = true;
  try { [rows.value, dashboard.value, alipayStatus.value] = await Promise.all([getWithdrawalBatchesApi(), getFinanceDashboardApi(), getAlipayPayoutStatusApi()]); }
  finally { loading.value = false; }
}

async function executeBatchAction() {
  const batch = actionBatch.value;
  if (!batch) return;
  actionVisible.value = false;
  batchActionId.value = batch.id;
  try {
    const result = actionMode.value === 'PAY'
      ? await startAlipayWithdrawalBatchApi(batch.id)
      : await queryAlipayWithdrawalBatchApi(batch.id);
    message.success(result.started
      ? `${actionMode.value === 'PAY' ? '批量打款' : '批量查单'}任务已启动，页面会自动刷新进度`
      : '该批次任务正在执行，请稍候查看进度');
    await load();
  } finally {
    batchActionId.value = '';
  }
}

async function download(row: WithdrawalBatch) {
  const blob = await exportWithdrawalBatchApi(row.id);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${row.batchNo}.csv`; anchor.click();
  URL.revokeObjectURL(url); message.success('敏感收款文件已导出并记录审计'); await load();
}
async function closeBatch(row: WithdrawalBatch) {
  if (!window.confirm(`确认关闭批次 ${row.batchNo} 并释放其中订单？`)) return;
  await closeWithdrawalBatchApi(row.id); message.success('批次已关闭，订单可重新组批'); await load();
}

/** 支持带引号、逗号和双引号转义的标准 CSV，避免简单 split(',') 破坏失败原因。 */
function parseCsv(text: string) {
  const table: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') { cell += '"'; index++; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index++;
      row.push(cell); if (row.some(Boolean)) table.push(row); row = []; cell = '';
    } else cell += char;
  }
  row.push(cell); if (row.some(Boolean)) table.push(row);
  const headers = table.shift()?.map((item) => item.replace(/^\uFEFF/, '').trim()) ?? [];
  const at = (record: string[], name: string) => record[headers.indexOf(name)]?.trim() || undefined;
  return table.map((record) => ({
    withdrawalId: at(record, 'withdrawalId') ?? '',
    success: ['1', 'true', 'success', '成功'].includes((at(record, 'success') ?? '').toLowerCase()),
    paymentReference: at(record, 'paymentReference'), failureReason: at(record, 'failureReason'),
  }));
}

function openImport(batch: WithdrawalBatch) {
  activeBatch.value = batch; resultRows.value = []; preview.value = undefined; resultRequestId.value = crypto.randomUUID(); importVisible.value = true;
}
async function chooseFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]; if (!file || !activeBatch.value) return;
  resultRows.value = parseCsv(await file.text());
  preview.value = await previewWithdrawalBatchResultsApi(activeBatch.value.id, { requestId: resultRequestId.value, rows: resultRows.value });
}
async function confirmResults() {
  if (!activeBatch.value || !preview.value || preview.value.invalid) return message.error('预检未通过，不能确认');
  await confirmWithdrawalBatchResultsApi(activeBatch.value.id, { requestId: resultRequestId.value, rows: resultRows.value });
  message.success('批次结果已确认，余额与订单已在同一事务完成结算'); importVisible.value = false; await load();
}
onMounted(() => {
  void load();
  refreshTimer = setInterval(() => {
    if (rows.value.some((row) => row.status === 'PROCESSING') && !loading.value) void load();
  }, 4000);
});
onUnmounted(() => { if (refreshTimer) clearInterval(refreshTimer); });
</script>

<template>
  <Page title="提现批次与财务打款" description="批次创建、敏感导出、结果预检和幂等确认的完整闭环">
    <NAlert v-if="alipayStatus && !alipayStatus.configured" type="warning" class="mb-4" title="支付宝批量打款尚未就绪">
      缺少配置：{{ alipayStatus.missing.join('、') }}。配置完成并重启后端后才能发起真实打款。
    </NAlert>
    <NGrid class="mb-4" cols="1 s:2 l:4" responsive="screen" :x-gap="16" :y-gap="16">
      <NGi><NCard><NStatistic label="今日申请" :value="dashboard.today.count" /></NCard></NGi>
      <NGi><NCard><NStatistic label="今日金额（元）" :value="(dashboard.today.cents / 100).toFixed(2)" /></NCard></NGi>
      <NGi><NCard><NStatistic label="超时未处理" :value="dashboard.timeoutCount" /></NCard></NGi>
      <NGi><NCard><NStatistic label="异常批次" :value="dashboard.abnormalBatches" /></NCard></NGi>
      <NGi><NCard><NStatistic label="待审核金额（元）" :value="((statusMap.PENDING?._sum.actualCents ?? 0) / 100).toFixed(2)" /></NCard></NGi>
      <NGi><NCard><NStatistic label="打款中金额（元）" :value="((statusMap.PAYING?._sum.actualCents ?? 0) / 100).toFixed(2)" /></NCard></NGi>
      <NGi><NCard><NStatistic label="打款成功率" :value="successRate" /></NCard></NGi>
      <NGi><NCard><NStatistic label="打款失败数" :value="failed" /></NCard></NGi>
    </NGrid>
    <NCard><NDataTable :columns="columns" :data="rows" :loading="loading" :row-key="(row: WithdrawalBatch) => row.id" /></NCard>
    <NModal v-model:show="actionVisible" preset="card" class="modal-sm" :title="actionMode === 'PAY' ? '确认支付宝批量打款' : '确认批量查单'">
      <template v-if="actionBatch">
        <NAlert :type="actionMode === 'PAY' ? 'warning' : 'info'">
          <template v-if="actionMode === 'PAY'">
            即将向批次 {{ actionBatch.batchNo }} 中 {{ pendingCount(actionBatch) }} 笔待处理订单发起真实支付宝转账，提交后不可撤销。
          </template>
          <template v-else>
            将查询批次 {{ actionBatch.batchNo }} 中 {{ pendingCount(actionBatch) }} 笔未确认订单，并同步支付宝结果。
          </template>
        </NAlert>
        <div class="mt-4 rounded-lg bg-gray-100 p-3 dark:bg-gray-800">
          批次金额：¥{{ (actionBatch.totalCents / 100).toFixed(2) }} · 共 {{ actionBatch.orderCount }} 笔
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <NButton @click="actionVisible=false">取消</NButton>
          <NButton :type="actionMode === 'PAY' ? 'error' : 'primary'" @click="executeBatchAction">
            {{ actionMode === 'PAY' ? '确认并二次验证' : '开始查单' }}
          </NButton>
        </div>
      </template>
    </NModal>
    <NModal v-model:show="importVisible" preset="card" title="导入支付结果" class="modal-lg">
      <p class="mb-3 text-gray-500">CSV 列：withdrawalId, success, paymentReference, failureReason。确认前只执行预检。</p>
      <input type="file" accept=".csv,text/csv" @change="chooseFile" />
      <div v-if="preview" class="mt-4">
        <NTag :type="preview.invalid ? 'error' : 'success'">有效 {{ preview.rows.length - preview.invalid }} / 错误 {{ preview.invalid }}</NTag>
        <NDataTable class="mt-3" :data="preview.rows" :pagination="false" :columns="[
          { title: '订单 ID', key: 'withdrawalId' }, { title: '结果', key: 'success', render: (row: any) => row.success ? '成功' : '失败' },
          { title: '校验', key: 'errors', render: (row: any) => row.errors.join('；') || '通过' },
        ]" />
      </div>
      <template #footer><div class="flex justify-end gap-2"><NButton @click="importVisible=false">取消</NButton><NButton type="primary" :disabled="!preview || preview.invalid > 0" @click="confirmResults">确认入账</NButton></div></template>
    </NModal>
  </Page>
</template>
