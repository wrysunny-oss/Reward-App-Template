<script lang="ts" setup>
import type { DataTableColumns } from 'naive-ui';
import type { AdminUser, Role } from '#/api';
import { onMounted, ref } from 'vue';
import { Page } from '@vben/common-ui';
import { NCard, NDataTable } from 'naive-ui';
import { getAdministratorsApi } from '#/api';
import { businessStatusText } from '#/utils/business-status';
import { formatDateTime } from '#/utils/date-time';

type Administrator = AdminUser & { roles: Array<{ role: Role }> };
defineOptions({ name: 'AdministratorManagement' });
const loading = ref(false);
const rows = ref<Administrator[]>([]);
const columns: DataTableColumns<Administrator> = [
  { title: 'ID', key: 'id' }, { title: '账号', key: 'phone' }, { title: '昵称', key: 'nickname' },
  { title: '角色', key: 'roles', render: (row) => row.roles.map((item) => item.role.name).join('、') },
  { title: '状态', key: 'status', render: (row) => businessStatusText(row.status) }, { title: '创建时间', key: 'createdAt', render: (row) => formatDateTime(row.createdAt) },
];
onMounted(async () => { loading.value = true; try { rows.value = await getAdministratorsApi(); } finally { loading.value = false; } });
</script>

<template><Page title="管理员" description="拥有后台角色的账号"><NCard><NDataTable :columns="columns" :data="rows" :loading="loading" /></NCard></Page></template>
