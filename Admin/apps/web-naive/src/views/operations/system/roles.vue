<script lang="ts" setup>
import type { Role } from '#/api';
import { onMounted, ref } from 'vue';
import { Page } from '@vben/common-ui';
import { NCard, NDataTable } from 'naive-ui';
import { getRolesApi } from '#/api';

defineOptions({ name: 'RoleManagement' });
const loading = ref(false);
const rows = ref<Role[]>([]);
onMounted(async () => { loading.value = true; try { rows.value = await getRolesApi(); } finally { loading.value = false; } });
</script>

<template>
  <Page title="角色权限" description="角色、成员数量及已分配权限">
    <NCard><NDataTable :loading="loading" :data="rows" :columns="[
      { title: '角色', key: 'name' }, { title: '编码', key: 'code' },
      { title: '成员数', key: 'users', render: (row: Role) => row._count.users },
      { title: '类型', key: 'system', render: (row: Role) => row.isSystem ? '系统内置' : '自定义' },
      { title: '权限', key: 'permissions', render: (row: Role) => row.permissions.map((item) => item.permission.name).join('、') },
    ]" /></NCard>
  </Page>
</template>
