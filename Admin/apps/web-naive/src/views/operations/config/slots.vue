<script lang="ts" setup>
import type { UploadCustomRequestOptions } from 'naive-ui';

import type { OperationSlot } from '#/api';

import { computed, h, onMounted, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import {
  NButton, NCard, NDataTable, NDatePicker, NForm, NFormItem, NImage, NInput,
  NInputNumber, NModal, NSelect, NSpace, NSwitch, NTag, NUpload, useDialog, useMessage,
} from 'naive-ui';

import {
  createOperationSlotApi, deleteOperationSlotApi, getOperationSlotsApi,
  updateOperationSlotApi, uploadOperationImageApi,
} from '#/api';
import { resolveAssetUrl } from '#/api/request';

defineOptions({ name: 'OperationSlots' });
const message = useMessage();
const dialog = useDialog();
const { hasAccessByCodes } = useAccess();
const canUpdate = hasAccessByCodes(['operation:update']);
const canUpload = hasAccessByCodes(['upload:create']);
const rows = ref<OperationSlot[]>([]);
const loading = ref(false);
const saving = ref(false);
const visible = ref(false);
const previewVisible = ref(false);
const editingId = ref('');
const previewRow = ref<OperationSlot>();
const activeFilter = ref<'ACTIVE' | 'ALL' | 'DISABLED' | 'EXPIRED' | 'UPCOMING'>('ALL');
const range = ref<[number, number] | null>(null);
const blank = (): Omit<OperationSlot, 'id'> => ({ placement: 'HOME_RECOMMEND', title: '', imageUrl: '', targetType: 'NONE', targetValue: null, sort: 0, enabled: true, startAt: null, endAt: null });
const form = reactive<Omit<OperationSlot, 'id'>>(blank());
const placements = [{ label: '首页推荐', value: 'HOME_RECOMMEND' }, { label: '启动弹窗', value: 'STARTUP_POPUP' }];
const targets = [{ label: '无跳转', value: 'NONE' }, { label: '内容详情', value: 'CONTENT' }, { label: 'App 内页面', value: 'INTERNAL' }, { label: '外部链接', value: 'EXTERNAL' }];
const statusOptions = [{label: '全部状态', value: 'ALL'}, {label: '生效中', value: 'ACTIVE'}, {label: '待生效', value: 'UPCOMING'}, {label: '已过期', value: 'EXPIRED'}, {label: '已停用', value: 'DISABLED'}];
const placementText: Record<string, string> = {HOME_BANNER: '旧版首页展示位', HOME_RECOMMEND: '首页推荐', STARTUP_POPUP: '启动弹窗'};
const targetText: Record<string, string> = {NONE: '无跳转', CONTENT: '内容详情', INTERNAL: 'App 内页面', EXTERNAL: '外部链接'};
const imageTip = computed(() => form.placement === 'STARTUP_POPUP' ? '启动弹窗建议 4:5 竖图，主体居中并预留四周安全区' : '首页推荐建议 3:2 横图，避免在图片内放置小字号文字');

function slotStatus(row: OperationSlot) {
  const now = Date.now();
  if (!row.enabled) return {key: 'DISABLED', label: '已停用', type: 'default' as const};
  if (row.startAt && new Date(row.startAt).getTime() > now) return {key: 'UPCOMING', label: '待生效', type: 'warning' as const};
  if (row.endAt && new Date(row.endAt).getTime() <= now) return {key: 'EXPIRED', label: '已过期', type: 'error' as const};
  return {key: 'ACTIVE', label: '生效中', type: 'success' as const};
}
const shownRows = computed(() => activeFilter.value === 'ALL' ? rows.value : rows.value.filter(row => slotStatus(row).key === activeFilter.value));
const formatTime = (value?: null | string) => value ? new Date(value).toLocaleString('zh-CN', {hour12: false}) : '不限';

async function load() {
  loading.value = true;
  try { rows.value = await getOperationSlotsApi(); }
  finally { loading.value = false; }
}
function open(row?: OperationSlot) {
  editingId.value = row?.id ?? '';
  Object.assign(form, row ? {...row} : blank());
  range.value = row?.startAt && row?.endAt ? [new Date(row.startAt).getTime(), new Date(row.endAt).getTime()] : null;
  visible.value = true;
}
function validate() {
  if (!form.title.trim() || !form.imageUrl.trim()) return '标题和图片不能为空';
  if (form.targetType !== 'NONE' && !form.targetValue?.trim()) return '当前跳转类型必须填写跳转目标';
  if (form.targetType === 'EXTERNAL' && !/^https:\/\//i.test(form.targetValue ?? '')) return '外部链接必须使用 HTTPS 地址';
  if (form.targetType === 'CONTENT' && !/^\d+$/.test(form.targetValue ?? '')) return '内容详情目标必须填写数字内容 ID';
  return '';
}
async function save() {
  const error = validate();
  if (error) return message.error(error);
  saving.value = true;
  try {
    const data = {...form, targetValue: form.targetType === 'NONE' ? null : form.targetValue?.trim(), startAt: range.value ? new Date(range.value[0]).toISOString() : null, endAt: range.value ? new Date(range.value[1]).toISOString() : null};
    editingId.value ? await updateOperationSlotApi(editingId.value, data) : await createOperationSlotApi(data);
    message.success('运营位已保存'); visible.value = false; await load();
  } finally { saving.value = false; }
}
async function toggle(row: OperationSlot) {
  await updateOperationSlotApi(row.id, {...row, enabled: !row.enabled});
  message.success(row.enabled ? '已停用' : '已启用'); await load();
}
function duplicate(row: OperationSlot) {
  open(); Object.assign(form, {...row, title: `${row.title}（副本）`, enabled: false});
  range.value = row.startAt && row.endAt ? [new Date(row.startAt).getTime(), new Date(row.endAt).getTime()] : null;
}
function remove(row: OperationSlot) {
  dialog.warning({title: '删除运营位', content: `确认永久删除“${row.title}”吗？`, positiveText: '确认删除', negativeText: '取消', onPositiveClick: async () => { await deleteOperationSlotApi(row.id); message.success('已删除'); await load(); }});
}
async function upload({ file, onError, onFinish }: UploadCustomRequestOptions) {
  try { if (!file.file) throw new Error('文件为空'); const asset = await uploadOperationImageApi(file.file); form.imageUrl = asset.url; message.success('图片上传成功'); onFinish(); }
  catch (error: any) { message.error(error?.message || '图片上传失败，请确认格式和大小'); onError(); }
}
function showPreview(row: OperationSlot) { previewRow.value = row; previewVisible.value = true; }

const columns = [
  {title: '预览', key: 'imageUrl', width: 94, render: (row: OperationSlot) => h(NImage, {src: resolveAssetUrl(row.imageUrl), width: 72, height: 48, objectFit: 'cover', previewDisabled: true, style: 'border-radius:8px'})},
  {title: '位置', key: 'placement', width: 110, render: (row: OperationSlot) => placementText[row.placement]},
  {title: '标题', key: 'title', minWidth: 170},
  {title: '跳转', key: 'targetType', width: 105, render: (row: OperationSlot) => targetText[row.targetType]},
  {title: '有效期', key: 'time', minWidth: 180, render: (row: OperationSlot) => `${formatTime(row.startAt)} ～ ${formatTime(row.endAt)}`},
  {title: '排序', key: 'sort', width: 70},
  {title: '状态', key: 'status', width: 90, render: (row: OperationSlot) => { const status = slotStatus(row); return h(NTag, {type: status.type, bordered: false}, {default: () => status.label}); }},
  {title: '操作', key: 'actions', width: canUpdate ? 270 : 80, render: (row: OperationSlot) => h(NSpace, {}, {default: () => [h(NButton, {size: 'small', onClick: () => showPreview(row)}, {default: () => '预览'}), ...(canUpdate ? [h(NButton, {size: 'small', onClick: () => open(row)}, {default: () => '编辑'}), h(NButton, {size: 'small', onClick: () => duplicate(row)}, {default: () => '复制'}), h(NButton, {size: 'small', type: row.enabled ? 'warning' : 'success', onClick: () => toggle(row)}, {default: () => row.enabled ? '停用' : '启用'}), h(NButton, {size: 'small', type: 'error', onClick: () => remove(row)}, {default: () => '删除'})] : [])]})},
];
onMounted(load);
</script>

<template>
  <Page title="首页与弹窗" description="只有处于有效期且启用的内容会下发到 App">
    <NCard>
      <div class="filter-toolbar mb-4">
        <NSelect v-model:value="activeFilter" class="status-filter" :options="statusOptions" />
        <NButton v-if="canUpdate" type="primary" class="toolbar-action" @click="open()">新增运营位</NButton>
      </div>
      <NDataTable :columns="columns" :data="shownRows" :loading="loading" :scroll-x="1100" />
    </NCard>
    <NModal v-model:show="visible" preset="card" :title="editingId ? '编辑运营位' : '新增运营位'">
      <NForm label-placement="left" label-width="92">
        <NFormItem label="展示位置"><NSelect v-model:value="form.placement" :options="placements" /></NFormItem>
        <NFormItem label="标题"><NInput v-model:value="form.title" maxlength="100" show-count /></NFormItem>
        <NFormItem label="图片"><div class="w-full"><NUpload v-if="canUpload" accept="image/jpeg,image/png,image/webp,image/gif" :custom-request="upload" :max="1"><NButton>上传图片</NButton></NUpload><div class="mt-2 text-xs text-gray-500">{{ imageTip }}</div><NInput v-model:value="form.imageUrl" class="mt-2" placeholder="HTTPS 图片地址，或点击上方上传" /><NImage v-if="form.imageUrl" class="mt-3 overflow-hidden rounded-lg" :src="resolveAssetUrl(form.imageUrl)" width="240" height="130" object-fit="cover" /></div></NFormItem>
        <NFormItem label="跳转类型"><NSelect v-model:value="form.targetType" :options="targets" @update:value="value => value === 'NONE' && (form.targetValue = null)" /></NFormItem>
        <NFormItem v-if="form.targetType !== 'NONE'" label="跳转目标"><NInput v-model:value="form.targetValue" :placeholder="form.targetType === 'CONTENT' ? '内容 ID' : form.targetType === 'EXTERNAL' ? 'https://example.com' : 'App 路由名称'" /></NFormItem>
        <NFormItem label="展示时间"><NDatePicker v-model:value="range" type="datetimerange" clearable class="w-full" /></NFormItem>
        <NFormItem label="排序"><NInputNumber v-model:value="form.sort" class="w-full" /></NFormItem>
        <NFormItem label="启用"><NSwitch v-model:value="form.enabled" /></NFormItem>
      </NForm>
      <template #footer><div class="flex justify-end gap-2"><NButton @click="visible = false">取消</NButton><NButton type="primary" :loading="saving" @click="save">保存</NButton></div></template>
    </NModal>
    <NModal v-model:show="previewVisible" preset="card" title="App 展示预览" class="modal-xs">
      <div v-if="previewRow" class="overflow-hidden rounded-2xl bg-[#090d15] p-3 text-white"><NImage :src="resolveAssetUrl(previewRow.imageUrl)" width="100%" :height="previewRow.placement === 'STARTUP_POPUP' ? 360 : 180" object-fit="cover" preview-disabled class="w-full overflow-hidden rounded-xl" /><div class="mt-3 text-base font-semibold">{{ previewRow.title }}</div><div class="mt-1 text-xs text-gray-400">{{ placementText[previewRow.placement] }} · {{ targetText[previewRow.targetType] }}</div></div>
    </NModal>
  </Page>
</template>

<style scoped>
.filter-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-filter {
  width: 180px;
  flex: 0 0 180px;
}

.toolbar-action {
  margin-left: auto;
}

@media (max-width: 640px) {
  .filter-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

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
