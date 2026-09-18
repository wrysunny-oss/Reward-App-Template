<script lang="ts" setup>
import type { Announcement } from '#/api';

import { computed, h, onMounted, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import { NButton, NCard, NDataTable, NDatePicker, NForm, NFormItem, NInput, NModal, NSelect, NSpace, NTag, useDialog, useMessage } from 'naive-ui';

import { createAnnouncementApi, deleteAnnouncementApi, getAnnouncementsApi, sendNotificationApi, updateAnnouncementApi } from '#/api';
import { businessStatusText, businessStatusType } from '#/utils/business-status';

defineOptions({name: 'Announcements'});
const message = useMessage();
const dialog = useDialog();
const {hasAccessByCodes} = useAccess();
const canUpdate = hasAccessByCodes(['operation:update']);
const rows = ref<Announcement[]>([]);
const loading = ref(false);
const saving = ref(false);
const visible = ref(false);
const previewVisible = ref(false);
const sendVisible = ref(false);
const sendSaving = ref(false);
const previewRow = ref<Announcement>();
const editingId = ref('');
const keyword = ref('');
const statusFilter = ref('ALL');
const range = ref<[number, number] | null>(null);
const blank = (): Omit<Announcement, 'id'> => ({title: '', content: '', status: 'DRAFT', startAt: null, endAt: null});
const form = reactive<Omit<Announcement, 'id'>>(blank());
const messageForm = reactive({target: 'ALL' as 'ALL' | 'USER', phone: '', type: 'SYSTEM' as 'PROMOTION' | 'REWARD' | 'SYSTEM' | 'WITHDRAWAL', title: '', content: ''});
const statusOptions = [{label: '全部状态', value: 'ALL'}, {label: '草稿', value: 'DRAFT'}, {label: '已发布', value: 'PUBLISHED'}, {label: '已下线', value: 'OFFLINE'}];
const publishOptions = statusOptions.slice(1);
const targetOptions = [{label: '全部活跃用户', value: 'ALL'}, {label: '指定手机号', value: 'USER'}];
const messageTypeOptions = [{label: '系统通知', value: 'SYSTEM'}, {label: '活动推广', value: 'PROMOTION'}, {label: '奖励提醒', value: 'REWARD'}, {label: '提现通知', value: 'WITHDRAWAL'}];
const formatTime = (value?: null | string) => value ? new Date(value).toLocaleString('zh-CN', {hour12: false}) : '-';
const shownRows = computed(() => rows.value.filter(row => (statusFilter.value === 'ALL' || row.status === statusFilter.value) && (!keyword.value.trim() || `${row.title} ${row.content}`.toLowerCase().includes(keyword.value.trim().toLowerCase()))));

function payload(row: Announcement | Omit<Announcement, 'id'>, status = row.status): Omit<Announcement, 'id'> {
  return {title: row.title, content: row.content, status, startAt: row.startAt ?? null, endAt: row.endAt ?? null};
}
async function load() { loading.value = true; try { rows.value = await getAnnouncementsApi(); } finally { loading.value = false; } }
function open(row?: Announcement) {
  editingId.value = row?.id ?? '';
  Object.assign(form, row ? payload(row) : blank());
  range.value = row?.startAt && row?.endAt ? [new Date(row.startAt).getTime(), new Date(row.endAt).getTime()] : null;
  visible.value = true;
}
async function save() {
  if (!form.title.trim()) return message.error('请输入公告标题');
  if (!form.content.trim()) return message.error('请输入公告内容');
  saving.value = true;
  try {
    const data = {...payload(form), title: form.title.trim(), content: form.content.trim(), startAt: range.value ? new Date(range.value[0]).toISOString() : null, endAt: range.value ? new Date(range.value[1]).toISOString() : null};
    editingId.value ? await updateAnnouncementApi(editingId.value, data) : await createAnnouncementApi(data);
    visible.value = false; message.success(data.status === 'PUBLISHED' ? '公告已发布' : '公告已保存'); await load();
  } finally { saving.value = false; }
}
async function changeStatus(row: Announcement, status: Announcement['status']) {
  await updateAnnouncementApi(row.id, payload(row, status));
  message.success(status === 'PUBLISHED' ? '公告已发布' : '公告已下线'); await load();
}
function remove(row: Announcement) {
  dialog.warning({title: '删除公告', content: `确认永久删除“${row.title}”吗？`, positiveText: '确认删除', negativeText: '取消', onPositiveClick: async () => { await deleteAnnouncementApi(row.id); message.success('公告已删除'); await load(); }});
}
function preview(row: Announcement) { previewRow.value = row; previewVisible.value = true; }
function openSend() {
  Object.assign(messageForm, {target: 'ALL', phone: '', type: 'SYSTEM', title: '', content: ''});
  sendVisible.value = true;
}
async function sendMessage() {
  if (messageForm.target === 'USER' && !/^1\d{10}$/.test(messageForm.phone.trim())) return message.error('请输入正确的用户手机号');
  if (!messageForm.title.trim() || !messageForm.content.trim()) return message.error('请填写通知标题和内容');
  sendSaving.value = true;
  try {
    const result = await sendNotificationApi({...messageForm, phone: messageForm.target === 'USER' ? messageForm.phone.trim() : undefined, title: messageForm.title.trim(), content: messageForm.content.trim()});
    sendVisible.value = false;
    message.success(`站内信已发送给 ${result.recipients} 位用户`);
  } finally { sendSaving.value = false; }
}

const columns = [
  {title: '标题', key: 'title', minWidth: 220},
  {title: '内容摘要', key: 'content', minWidth: 260, ellipsis: {tooltip: true}},
  {title: '状态', key: 'status', width: 90, render: (row: Announcement) => h(NTag, {type: businessStatusType(row.status), bordered: false}, {default: () => businessStatusText(row.status)})},
  {title: '生效时间', key: 'startAt', width: 165, render: (row: Announcement) => formatTime(row.startAt)},
  {title: '失效时间', key: 'endAt', width: 165, render: (row: Announcement) => formatTime(row.endAt)},
  {title: '操作', key: 'operation', width: canUpdate ? 245 : 70, render: (row: Announcement) => h(NSpace, {}, {default: () => [h(NButton, {size: 'small', onClick: () => preview(row)}, {default: () => '预览'}), ...(canUpdate ? [h(NButton, {size: 'small', onClick: () => open(row)}, {default: () => '编辑'}), row.status === 'PUBLISHED' ? h(NButton, {size: 'small', type: 'warning', onClick: () => changeStatus(row, 'OFFLINE')}, {default: () => '下线'}) : h(NButton, {size: 'small', type: 'success', onClick: () => changeStatus(row, 'PUBLISHED')}, {default: () => '发布'}), h(NButton, {size: 'small', type: 'error', onClick: () => remove(row)}, {default: () => '删除'})] : [])]})},
];
onMounted(load);
</script>

<template>
  <Page title="公告管理" description="发布后的公告会同步到 App 通知中心；可设置自动生效和失效时间">
    <NCard>
      <div class="filter-toolbar mb-4">
        <NInput v-model:value="keyword" clearable placeholder="搜索标题或正文" class="keyword-filter" />
        <NSelect v-model:value="statusFilter" :options="statusOptions" class="status-filter" />
        <div v-if="canUpdate" class="toolbar-action flex gap-2"><NButton @click="openSend">发送站内信</NButton><NButton type="primary" @click="open()">新增公告</NButton></div>
      </div>
      <NDataTable :data="shownRows" :columns="columns" :loading="loading" :scroll-x="1100" />
    </NCard>
    <NModal v-model:show="visible" preset="card" :title="editingId ? '编辑公告' : '新增公告'">
      <NForm label-placement="top">
        <NFormItem label="标题"><NInput v-model:value="form.title" maxlength="150" show-count /></NFormItem>
        <NFormItem label="内容"><NInput v-model:value="form.content" type="textarea" :rows="10" maxlength="50000" show-count /></NFormItem>
        <NFormItem label="展示时间"><NDatePicker v-model:value="range" type="datetimerange" clearable class="w-full" /></NFormItem>
        <NFormItem label="发布状态"><NSelect v-model:value="form.status" :options="publishOptions" /></NFormItem>
      </NForm>
      <template #footer><div class="flex justify-end gap-2"><NButton @click="visible = false">取消</NButton><NButton type="primary" :loading="saving" @click="save">保存</NButton></div></template>
    </NModal>
    <NModal v-model:show="previewVisible" preset="card" title="App 公告预览" class="modal-xs">
      <div v-if="previewRow" class="rounded-2xl bg-[#111722] p-5 text-white"><div class="text-lg font-semibold">{{ previewRow.title }}</div><div class="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-300">{{ previewRow.content }}</div><div class="mt-4 text-xs text-gray-500">发布时间：{{ formatTime(previewRow.startAt || previewRow.createdAt) }}</div></div>
    </NModal>
    <NModal v-model:show="sendVisible" preset="card" title="发送 App 站内信">
      <NForm label-placement="top">
        <NFormItem label="发送对象"><NSelect v-model:value="messageForm.target" :options="targetOptions" /></NFormItem>
        <NFormItem v-if="messageForm.target === 'USER'" label="用户手机号"><NInput v-model:value="messageForm.phone" maxlength="11" placeholder="请输入已注册手机号" /></NFormItem>
        <NFormItem label="消息类型"><NSelect v-model:value="messageForm.type" :options="messageTypeOptions" /></NFormItem>
        <NFormItem label="通知标题"><NInput v-model:value="messageForm.title" maxlength="150" show-count /></NFormItem>
        <NFormItem label="通知内容"><NInput v-model:value="messageForm.content" type="textarea" :rows="6" maxlength="5000" show-count /></NFormItem>
      </NForm>
      <template #footer><div class="flex justify-end gap-2"><NButton @click="sendVisible = false">取消</NButton><NButton type="primary" :loading="sendSaving" @click="sendMessage">确认发送</NButton></div></template>
    </NModal>
  </Page>
</template>

<style scoped>
.filter-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.keyword-filter {
  width: 320px;
  flex: 0 1 320px;
}

.status-filter {
  width: 160px;
  flex: 0 0 160px;
}

.toolbar-action {
  margin-left: auto;
}

@media (max-width: 640px) {
  .filter-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .keyword-filter,
  .status-filter {
    width: 100%;
    flex-basis: auto;
  }

  .toolbar-action {
    align-self: flex-end;
    margin-left: 0;
  }
}
</style>
