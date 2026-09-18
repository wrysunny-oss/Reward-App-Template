<script lang="ts" setup>
import type { DataTableColumns } from 'naive-ui';
import type { InviteRelation } from '#/api';
import { onMounted, reactive, ref } from 'vue';
import { Page } from '@vben/common-ui';
import { NCard, NDataTable, NPagination } from 'naive-ui';
import { getInviteRelationsApi } from '#/api';
import { formatDateTime } from '#/utils/date-time';

defineOptions({ name: 'InviteRelations' });
const loading = ref(false);
const rows = ref<InviteRelation[]>([]);
const page = reactive({ current: 1, size: 20, total: 0 });
const columns: DataTableColumns<InviteRelation> = [
  { title: '绑定时间', key: 'createdAt', width: 190, render: (row) => formatDateTime(row.createdAt) },
  { title: '邀请码', key: 'inviteCode', width: 130 },
  { title: '邀请人', key: 'inviter', render: (row) => `${row.inviter.nickname} (${row.inviter.phone})` },
  { title: '受邀用户', key: 'invitee', render: (row) => `${row.invitee.nickname} (${row.invitee.phone})` },
];
async function load() { loading.value = true; try { const data = await getInviteRelationsApi({ page: page.current, pageSize: page.size }); rows.value = data.list; page.total = data.total; } finally { loading.value = false; } }
onMounted(load);
</script>
<template><Page title="邀请记录" description="邀请关系绑定后不可修改"><NCard><NDataTable :columns="columns" :data="rows" :loading="loading" /><div class="mt-4 flex justify-end"><NPagination v-model:page="page.current" :item-count="page.total" :page-size="page.size" @update:page="load" /></div></NCard></Page></template>
