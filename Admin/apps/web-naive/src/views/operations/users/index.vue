<script lang="ts" setup>
import type { DataTableColumns } from 'naive-ui';
import type { AdminUser } from '#/api';
import { h, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Page } from '@vben/common-ui';
import { useAccess } from '@vben/access';
import { NButton, NCard, NDataTable, NForm, NFormItem, NInput, NInputNumber, NModal, NPagination, NSpace, NTag } from 'naive-ui';
import { dialog, message } from '#/adapter/naive';
import { createLevelOneAgentApi, getUsersApi, updateUserStatusApi } from '#/api';
import { formatDateTime } from '#/utils/date-time';

defineOptions({ name: 'UserList' });
const { hasAccessByCodes } = useAccess();
const isReadonlyAgent = hasAccessByCodes(['agent:readonly']);
const router = useRouter();
const loading = ref(false);
const rows = ref<AdminUser[]>([]);
const createVisible = ref(false);
const creating = ref(false);
const agentForm = reactive({ phone: '', nickname: '', password: '', agentSharePercent: 0 });
const query = reactive({ keyword: '', page: 1, pageSize: 20, total: 0 });

const columns: DataTableColumns<AdminUser> = [
  { key: 'id', title: 'ID', width: 120 },
  { key: 'phone', title: '手机号', width: 140 },
  { key: 'nickname', title: '昵称', minWidth: 140 },
  ...(isReadonlyAgent ? [{ key: 'agentDepth', title: '下级层级', width: 100, render: (row: AdminUser) => row.agentDepth ? `第 ${row.agentDepth} 级` : '-' }] : []),
  { key: 'role', title: '用户类型', width: 120, render: (row) => {
    if (row.roles?.some(({ role }) => role.code === 'level_one_agent')) return h(NTag, { type: 'info' }, { default: () => '代理用户' });
    if (row.roles?.length) return h(NTag, { type: 'warning' }, { default: () => '管理员用户' });
    return h(NTag, {}, { default: () => '普通用户' });
  } },
  { key: 'coinBalance', title: '金币', width: 100 },
  { key: 'status', title: '状态', width: 90, render: (row) => h(NTag, { type: row.status === 'ACTIVE' ? 'success' : 'error' }, { default: () => row.status === 'ACTIVE' ? '正常' : '禁用' }) },
  { key: 'createdAt', title: '注册时间', width: 190, render: (row) => formatDateTime(row.createdAt) },
  {
    key: 'actions', title: '操作', width: 150,
    render: (row) => h(NSpace, {}, {
      default: () => [
        h(NButton, { text: true, type: 'primary', onClick: () => router.push(`/users/${row.id}`) }, { default: () => '详情' }),
        ...(hasAccessByCodes(['user:update']) ? [h(NButton, { text: true, type: 'warning', onClick: () => confirmToggle(row) }, { default: () => row.status === 'ACTIVE' ? '禁用' : '启用' })] : []),
      ],
    }),
  },
];

async function loadUsers() {
  loading.value = true;
  try {
    const result = await getUsersApi({
      keyword: query.keyword || undefined,
      page: query.page,
      pageSize: query.pageSize,
    });
    rows.value = result.list;
    query.total = result.total;
  } finally { loading.value = false; }
}

function confirmToggle(user: AdminUser) {
  const next = user.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
  dialog.warning({
    title: '操作确认',
    content: `确认${next === 'ACTIVE' ? '启用' : '禁用'}用户“${user.nickname}”？`,
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: async () => {
      await updateUserStatusApi(user.id, next);
      message.success('用户状态已更新');
      await loadUsers();
    },
  });
}

async function createAgent() {
  if (!/^1\d{10}$/.test(agentForm.phone)) return message.warning('请输入正确的手机号');
  if (!agentForm.nickname.trim()) return message.warning('请输入昵称');
  if (agentForm.password.length < 8) return message.warning('初始密码至少 8 位');
  creating.value = true;
  try {
    const user = await createLevelOneAgentApi({ phone: agentForm.phone, password: agentForm.password, nickname: agentForm.nickname.trim(), agentShareRateBps: Math.round(agentForm.agentSharePercent * 100) });
    message.success(`代理创建成功，邀请码：${user.inviteCode}`);
    Object.assign(agentForm, { phone: '', nickname: '', password: '', agentSharePercent: 0 });
    createVisible.value = false;
    await loadUsers();
  } finally { creating.value = false; }
}

onMounted(loadUsers);
</script>

<template>
  <Page title="用户列表" description="查询用户并管理账号状态">
    <NCard>
      <NSpace class="mb-4">
        <NInput v-model:value="query.keyword" clearable placeholder="手机号或昵称" style="width: 260px" @keyup.enter="query.page = 1; loadUsers()" />
        <NButton type="primary" @click="query.page = 1; loadUsers()">查询</NButton>
        <NButton v-if="hasAccessByCodes(['user:update'])" type="primary" secondary @click="createVisible = true">新增代理</NButton>
      </NSpace>
      <NDataTable :columns="columns" :data="rows" :loading="loading" :row-key="(row: AdminUser) => row.id" striped />
      <div class="mt-4 flex justify-end"><NPagination v-model:page="query.page" v-model:page-size="query.pageSize" :item-count="query.total" show-size-picker :page-sizes="[10, 20, 50]" @update:page="loadUsers" @update:page-size="query.page = 1; loadUsers()" /></div>
    </NCard>
    <NModal v-model:show="createVisible" preset="card" title="新增代理" class="modal-sm">
      <NForm label-placement="top">
        <NFormItem label="手机号" required><NInput v-model:value="agentForm.phone" maxlength="11" placeholder="代理登录手机号" /></NFormItem>
        <NFormItem label="昵称" required><NInput v-model:value="agentForm.nickname" maxlength="50" placeholder="代理昵称" /></NFormItem>
        <NFormItem label="初始密码" required><NInput v-model:value="agentForm.password" type="password" show-password-on="click" placeholder="至少 8 位" /></NFormItem>
        <NFormItem label="无限下级广告分成（%）" required><NInputNumber v-model:value="agentForm.agentSharePercent" :min="0" :max="100" :precision="2" class="w-full"><template #suffix>%</template></NInputNumber></NFormItem>
      </NForm>
      <template #footer><div class="flex justify-end gap-2"><NButton @click="createVisible = false">取消</NButton><NButton type="primary" :loading="creating" @click="createAgent">确认创建</NButton></div></template>
    </NModal>
  </Page>
</template>
