<script lang="ts" setup>
import type { DataTableColumns } from 'naive-ui';
import type { AuditLog } from '#/api';
import { onMounted, ref } from 'vue';
import { Page } from '@vben/common-ui';
import { NCard, NDataTable } from 'naive-ui';
import { getAuditLogsApi } from '#/api';
import { formatDateTime } from '#/utils/date-time';

defineOptions({ name: 'AuditLogs' });
const loading = ref(false);
const rows = ref<AuditLog[]>([]);
const columns: DataTableColumns<AuditLog> = [
  { key: 'createdAt', title: '时间', width: 190, render: (row) => formatDateTime(row.createdAt) },
  { key: 'operatorId', title: '操作人', width: 120 },
  { key: 'action', title: '动作', width: 180 },
  { key: 'request', title: '请求', minWidth: 240, render: (row) => `${row.method} ${row.path}` },
  { key: 'target', title: '目标', width: 160, render: (row) => `${row.targetType || '-'} / ${row.targetId || '-'}` },
  { key: 'ip', title: 'IP', width: 140 },
];

onMounted(async () => {
  loading.value = true;
  try { rows.value = await getAuditLogsApi(); } finally { loading.value = false; }
});
</script>

<template>
  <Page title="操作日志" description="最近 100 条后台敏感操作记录">
    <NCard><NDataTable :columns="columns" :data="rows" :loading="loading" :row-key="(row: AuditLog) => row.id" striped /></NCard>
  </Page>
</template>
