<script lang="ts" setup>
import type { DataTableColumns } from 'naive-ui';
import type { CoinLedger } from '#/api';
import { h, onMounted, reactive, ref } from 'vue';
import { Page } from '@vben/common-ui';
import { NCard, NDataTable, NPagination, NTag } from 'naive-ui';
import { getCoinLedgersApi } from '#/api';
import { formatDateTime } from '#/utils/date-time';

defineOptions({ name: 'CoinLedgers' });
const loading = ref(false);
const rows = ref<CoinLedger[]>([]);
const page = reactive({ current: 1, size: 20, total: 0 });
const columns: DataTableColumns<CoinLedger> = [
  { title: '时间', key: 'createdAt', width: 190, render: (row) => formatDateTime(row.createdAt) },
  { title: '用户', key: 'user', render: (row) => `${row.user.nickname} (${row.user.phone})` },
  { title: '类型', key: 'type', width: 120 },
  { title: '说明', key: 'title' },
  // 接口以字符串返回大整数；这里只判断符号，不转换为 Number，避免精度损失和旧浏览器 BigInt 兼容问题。
  { title: '变动', key: 'amount', width: 100, render: (row) => h(NTag, { type: row.amount.startsWith('-') ? 'error' : 'success' }, { default: () => `${row.amount.startsWith('-') || row.amount === '0' ? '' : '+'}${row.amount}` }) },
  { title: '变动后余额', key: 'balanceAfter', width: 130 },
];
async function load() {
  loading.value = true;
  try { const result = await getCoinLedgersApi({ page: page.current, pageSize: page.size }); rows.value = result.list; page.total = result.total; }
  finally { loading.value = false; }
}
onMounted(load);
</script>

<template><Page title="金币流水" description="所有金币变动的不可变记录"><NCard><NDataTable :columns="columns" :data="rows" :loading="loading" /><div class="mt-4 flex justify-end"><NPagination v-model:page="page.current" :item-count="page.total" :page-size="page.size" @update:page="load" /></div></NCard></Page></template>
