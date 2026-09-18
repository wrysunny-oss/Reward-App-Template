<script lang="ts" setup>
import type { DataTableColumns } from 'naive-ui';

import type { Withdrawal, WithdrawalDetail, WithdrawalStatus } from '#/api';

import { h, onMounted, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';

import { NAlert, NButton, NCard, NDataTable, NDescriptions, NDescriptionsItem, NGrid, NGridItem, NInput, NModal, NPagination, NSelect, NSpace, NStatistic, NTag, useMessage } from 'naive-ui';

import { completeWithdrawalApi, createWithdrawalBatchApi, getAlipayPayoutStatusApi, getFinanceDashboardApi, getWithdrawalDetailApi, getWithdrawalsApi, payWithdrawalWithAlipayApi, queryAlipayWithdrawalApi, reviewWithdrawalApi } from '#/api';
import { formatDateTime } from '#/utils/date-time';

defineOptions({ name: 'WithdrawalOrders' });
const message = useMessage();
const loading = ref(false);
const rows = ref<Withdrawal[]>([]);
const checkedRowKeys = ref<Array<number | string>>([]);
const detail = ref<null | WithdrawalDetail>(null);
const detailVisible = ref(false);
const actionVisible = ref(false);
const actionLoading = ref(false);
const actionTitle = ref('确认操作');
const actionRemark = ref('');
const actionPaymentReference = ref('');
const actionRequiresPaymentReference = ref(false);
const dashboard = ref<Awaited<ReturnType<typeof getFinanceDashboardApi>>>();
const alipayStatus = ref<Awaited<ReturnType<typeof getAlipayPayoutStatusApi>>>();
const alipayActionId = ref('');
let actionCallback: ((remark: string, paymentReference?: string) => Promise<unknown>) | null = null;
const page = reactive({ current: 1, size: 20, total: 0 });
const filters = reactive<{ keyword: string; status?: WithdrawalStatus }>({ keyword: '' });
const statusOptions = [
  { label: '待审核', value: 'PENDING' }, { label: '打款中', value: 'PAYING' },
  { label: '已完成', value: 'COMPLETED' }, { label: '已拒绝', value: 'REJECTED' }, { label: '打款失败', value: 'FAILED' },
];
const statusText: Record<WithdrawalStatus, string> = { PENDING: '待审核', PAYING: '打款中', COMPLETED: '已完成', REJECTED: '已拒绝', FAILED: '打款失败' };
const statusType: Record<WithdrawalStatus, 'error' | 'info' | 'success' | 'warning'> = { PENDING: 'warning', PAYING: 'info', COMPLETED: 'success', REJECTED: 'error', FAILED: 'error' };
const columns: DataTableColumns<Withdrawal> = [
  { type: 'selection', disabled: (row) => row.status !== 'PAYING' },
  { title: '申请时间', key: 'createdAt', width: 190, render: (row) => formatDateTime(row.createdAt) },
  { title: '用户', key: 'user', render: (row) => `${row.user.nickname} (${row.user.phone})` },
  { title: '金币', key: 'coins', width: 110 },
  { title: '到账金额', key: 'actualCents', width: 110, render: (row) => `¥${(row.actualCents / 100).toFixed(2)}` },
  { title: '渠道', key: 'channel', width: 90 },
  { title: '收款账号', key: 'accountMasked', width: 150 },
  { title: '状态', key: 'status', width: 100, render: (row) => h(NTag, { type: statusType[row.status] }, { default: () => statusText[row.status] }) },
  { title: '操作', key: 'actions', width: 440, render: (row) => h(NSpace, { wrap: false }, { default: () => [
    h(NButton, { size: 'small', onClick: () => showDetail(row) }, { default: () => '详情' }),
    ...(row.status === 'PENDING' ? [h(NButton, { size: 'small', type: 'success', onClick: () => review(row, true) }, { default: () => '通过' }), h(NButton, { size: 'small', type: 'error', onClick: () => review(row, false) }, { default: () => '拒绝' })] : []),
    ...(row.status === 'PAYING' && row.channel === 'ALIPAY' ? [
      h(NButton, { disabled: !alipayStatus.value?.configured, loading: alipayActionId.value === row.id, size: 'small', type: 'primary', onClick: () => alipayPay(row) }, { default: () => row.paymentReference ? '重新发起' : '支付宝打款' }),
      h(NButton, { disabled: !alipayStatus.value?.configured, loading: alipayActionId.value === row.id, size: 'small', onClick: () => alipayQuery(row) }, { default: () => '查询支付宝' }),
    ] : []),
    ...(row.status === 'PAYING' ? [h(NButton, { size: 'small', onClick: () => finish(row, true) }, { default: () => '人工成功' }), h(NButton, { size: 'small', type: 'error', onClick: () => finish(row, false) }, { default: () => '人工失败' })] : []),
  ] }) },
];
async function load() { loading.value = true; try { const [data, stats, payoutStatus] = await Promise.all([getWithdrawalsApi({ page: page.current, pageSize: page.size, keyword: filters.keyword || undefined, status: filters.status }), getFinanceDashboardApi(), getAlipayPayoutStatusApi()]); rows.value = data.list; page.total = data.total; dashboard.value = stats; alipayStatus.value = payoutStatus; } finally { loading.value = false; } }
async function createBatch() {
  if (!checkedRowKeys.value.length) return message.warning('请选择打款中的订单');
  await createWithdrawalBatchApi({ requestId: crypto.randomUUID(), withdrawalIds: checkedRowKeys.value.map(String) });
  message.success('打款批次已创建'); checkedRowKeys.value = []; await load();
}
async function showDetail(row: Withdrawal) { detail.value = await getWithdrawalDetailApi(row.id); detailVisible.value = true; }

/** 使用页面内 NModal，避免依赖根布局未注册的 NDialogProvider。 */
function ask(title: string, callback: (remark: string, paymentReference?: string) => Promise<unknown>, requiresPaymentReference = false) {
  actionTitle.value = title;
  actionRemark.value = '';
  actionPaymentReference.value = '';
  actionRequiresPaymentReference.value = requiresPaymentReference;
  actionCallback = callback;
  actionVisible.value = true;
}
async function submitAction() {
  if (actionRemark.value.trim().length < 2) return message.error('处理备注至少 2 个字符');
  if (actionRequiresPaymentReference.value && !actionPaymentReference.value.trim()) return message.error('请填写支付流水号');
  if (!actionCallback) return;
  actionLoading.value = true;
  try {
    await actionCallback(actionRemark.value.trim(), actionPaymentReference.value.trim() || undefined);
    message.success('操作成功');
    actionVisible.value = false;
    await load();
  } finally { actionLoading.value = false; }
}
function review(row: Withdrawal, approved: boolean) { ask(approved ? '确认审核通过？' : '确认拒绝并退回金币？', (remark) => reviewWithdrawalApi(row.id, { approved, remark })); }
function finish(row: Withdrawal, success: boolean) { ask(success ? '确认已经完成打款？' : '确认打款失败并退回金币？', (remark, paymentReference) => completeWithdrawalApi(row.id, { success, remark, paymentReference }), success); }
async function alipayPay(row: Withdrawal) {
  alipayActionId.value = row.id;
  try {
    const result = await payWithdrawalWithAlipayApi(row.id);
    message.success(result.state === 'SUCCESS' ? '支付宝打款成功' : '打款请求已提交，请查询支付宝结果');
    await load();
  } finally { alipayActionId.value = ''; }
}
async function alipayQuery(row: Withdrawal) {
  alipayActionId.value = row.id;
  try {
    const result = await queryAlipayWithdrawalApi(row.id);
    message.success(result.state === 'SUCCESS' ? '已确认支付宝到账' : result.state === 'FAILED' ? '支付宝确认失败，金币已退回' : '支付宝仍在处理中');
    await load();
  } finally { alipayActionId.value = ''; }
}
onMounted(load);
</script>

<template>
  <Page title="提现审核" description="严格按照待审核、打款中、完成或退回的状态机处理">
    <NAlert v-if="alipayStatus && !alipayStatus.configured" type="warning" class="mb-4" title="支付宝自动打款尚未就绪">
      缺少配置：{{ alipayStatus.missing.join('、') }}。配置完成并重启后端后，支付宝打款按钮将自动启用。
    </NAlert>
    <NAlert v-if="dashboard?.timeoutCount" type="error" class="mb-4" title="存在超时提现订单">
      当前有 {{ dashboard.timeoutCount }} 笔订单超过 24 小时仍处于待审核或打款中，请优先处理。
    </NAlert>
    <NGrid v-if="dashboard" :cols="4" :x-gap="12" responsive="screen" class="mb-4">
      <NGridItem><NCard><NStatistic label="今日申请" :value="dashboard.today.count" /></NCard></NGridItem>
      <NGridItem><NCard><NStatistic label="今日申请金额(元)" :value="(dashboard.today.cents / 100).toFixed(2)" /></NCard></NGridItem>
      <NGridItem><NCard><NStatistic label="超时处理中" :value="dashboard.timeoutCount" /></NCard></NGridItem>
      <NGridItem><NCard><NStatistic label="异常打款批次" :value="dashboard.abnormalBatches" /></NCard></NGridItem>
    </NGrid>
    <NCard>
      <NSpace class="mb-4"><NInput v-model:value="filters.keyword" clearable placeholder="手机号或昵称" @keyup.enter="load" /><NSelect v-model:value="filters.status" clearable class="w-40" :options="statusOptions" placeholder="全部状态" /><NButton type="primary" @click="load">查询</NButton><NButton type="success" @click="createBatch">创建打款批次</NButton></NSpace>
      <NDataTable v-model:checked-row-keys="checkedRowKeys" :row-key="(row: Withdrawal) => row.id" :columns="columns" :data="rows" :loading="loading" :scroll-x="1350" />
      <div class="mt-4 flex justify-end"><NPagination v-model:page="page.current" :item-count="page.total" :page-size="page.size" @update:page="load" /></div>
    </NCard>

    <NModal v-model:show="detailVisible" preset="card" title="提现与收款信息">
      <NDescriptions v-if="detail" bordered :column="1">
        <NDescriptionsItem label="用户">{{ detail.user.nickname }}（{{ detail.user.phone }}）</NDescriptionsItem>
        <NDescriptionsItem label="实名">{{ detail.realName }}</NDescriptionsItem>
        <NDescriptionsItem label="收款账号">{{ detail.account }}</NDescriptionsItem>
        <NDescriptionsItem label="渠道">{{ detail.channel }}</NDescriptionsItem>
        <NDescriptionsItem label="提现金币">{{ detail.coins }}</NDescriptionsItem>
        <NDescriptionsItem label="到账金额">¥{{ (detail.actualCents / 100).toFixed(2) }}</NDescriptionsItem>
        <NDescriptionsItem label="当前状态"><NTag :type="statusType[detail.status]">{{ statusText[detail.status] }}</NTag></NDescriptionsItem>
        <NDescriptionsItem label="申请时间">{{ formatDateTime(detail.createdAt) }}</NDescriptionsItem>
        <NDescriptionsItem v-if="detail.reviewRemark" label="处理备注">{{ detail.reviewRemark }}</NDescriptionsItem>
        <NDescriptionsItem v-if="detail.paymentReference" label="支付流水号">{{ detail.paymentReference }}</NDescriptionsItem>
      </NDescriptions>
    </NModal>

    <NModal v-model:show="actionVisible" preset="card" :title="actionTitle" class="modal-sm">
      <NSpace vertical>
        <NInput v-if="actionRequiresPaymentReference" v-model:value="actionPaymentReference" :maxlength="100" placeholder="请输入支付平台流水号" />
        <NInput v-model:value="actionRemark" type="textarea" :maxlength="500" show-count placeholder="请输入处理备注（至少 2 个字符）" />
      </NSpace>
      <template #footer>
        <div class="flex justify-end gap-2"><NButton @click="actionVisible = false">取消</NButton><NButton type="primary" :loading="actionLoading" @click="submitAction">确认</NButton></div>
      </template>
    </NModal>
  </Page>
</template>
