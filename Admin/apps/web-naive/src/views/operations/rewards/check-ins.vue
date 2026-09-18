<script lang="ts" setup>
import type { DataTableColumns } from 'naive-ui';
import type { CheckInRecord } from '#/api';
import { onMounted, reactive, ref } from 'vue';
import { Page } from '@vben/common-ui';
import { NCard, NDataTable, NPagination } from 'naive-ui';
import { getCheckInsApi } from '#/api';
import { formatDate, formatDateTime } from '#/utils/date-time';

defineOptions({ name: 'CheckInRecords' });
const loading = ref(false);
const rows = ref<CheckInRecord[]>([]);
const page = reactive({ current: 1, size: 20, total: 0 });
const columns: DataTableColumns<CheckInRecord> = [
  { title: '签到日期', key: 'date', width: 120, render: (row) => formatDate(row.date) },
  { title: '用户', key: 'user', render: (row) => `${row.user.nickname} (${row.user.phone})` },
  { title: '连续天数', key: 'streak', width: 110 },
  { title: '奖励金币', key: 'reward', width: 110 },
  { title: '提交时间', key: 'createdAt', width: 190, render: (row) => formatDateTime(row.createdAt) },
];
async function load() { loading.value = true; try { const data = await getCheckInsApi({ page: page.current, pageSize: page.size }); rows.value = data.list; page.total = data.total; } finally { loading.value = false; } }
onMounted(load);
</script>
<template><Page title="签到记录" description="查看用户每日签到、连续天数及实际奖励"><NCard><NDataTable :columns="columns" :data="rows" :loading="loading" /><div class="mt-4 flex justify-end"><NPagination v-model:page="page.current" :item-count="page.total" :page-size="page.size" @update:page="load" /></div></NCard></Page></template>
