<script lang="ts" setup>
import type { ImageUploadOptions } from '@vben/plugins/tiptap';

import type { AppDocument } from '#/api';

import { computed, h, onMounted, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { VbenTiptap, VbenTiptapPreview } from '@vben/plugins/tiptap';

import { NButton, NCard, NDataTable, NForm, NFormItem, NInput, NModal, NSelect, NSpace, NTag, useMessage } from 'naive-ui';

import { createAppDocumentApi, getAppDocumentsApi, updateAppDocumentApi, uploadOperationImageApi } from '#/api';
import { resolveAssetUrl, resolveRichTextAssetUrls } from '#/api/request';
import { businessStatusText, businessStatusType } from '#/utils/business-status';

defineOptions({name: 'AppDocuments'});
const message = useMessage();
const {hasAccessByCodes} = useAccess();
const canUpdate = hasAccessByCodes(['operation:update']);
const canUpload = hasAccessByCodes(['upload:create']);
const rows = ref<AppDocument[]>([]);
const loading = ref(false);
const saving = ref(false);
const visible = ref(false);
const previewVisible = ref(false);
const previewRow = ref<AppDocument>();
const editingId = ref('');
const keyword = ref('');
const blank = (): Omit<AppDocument, 'id'> => ({code: 'USER_AGREEMENT', title: '', version: '1.0', content: '', status: 'DRAFT'});
const form = reactive<Omit<AppDocument, 'id'>>(blank());
const codes = [{label: '用户协议', value: 'USER_AGREEMENT'}, {label: '隐私政策', value: 'PRIVACY_POLICY'}, {label: '关于我们', value: 'HELP_CENTER'}];
const statuses = [{label: '草稿', value: 'DRAFT'}, {label: '已发布', value: 'PUBLISHED'}, {label: '已下线', value: 'OFFLINE'}];
const shownRows = computed(() => rows.value.filter(row => !keyword.value.trim() || `${row.title} ${row.code} ${row.version}`.toLowerCase().includes(keyword.value.trim().toLowerCase())));
const codeText = (code: string) => codes.find(item => item.value === code)?.label ?? code;
const formatTime = (value?: null | string) => value ? new Date(value).toLocaleString('zh-CN', {hour12: false}) : '-';
const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');
const normalizeRichText = (content: string) => resolveRichTextAssetUrls(
  /<[a-z][\s\S]*>/i.test(content)
    ? content
    : `<p>${escapeHtml(content).replaceAll('\n', '<br>')}</p>`,
);
const hasRichTextContent = (content: string) => {
  if (/<img\b/i.test(content)) return true;
  return Boolean(new DOMParser().parseFromString(content, 'text/html').body.textContent?.trim());
};
const imageUpload: ImageUploadOptions | undefined = canUpload ? {
  accept: 'image/jpeg,image/png,image/gif,image/webp',
  maxSize: 5 * 1024 * 1024,
  upload: async (file) => resolveAssetUrl((await uploadOperationImageApi(file)).url),
  onUploadError: (error) => message.error(error instanceof Error ? error.message : '图片上传失败'),
} : undefined;
async function load() { loading.value = true; try { rows.value = await getAppDocumentsApi(); } finally { loading.value = false; } }
function open(row?: AppDocument, duplicate = false) {
  editingId.value = row && !duplicate ? row.id : '';
  Object.assign(form, row ? {code: row.code, title: row.title, version: duplicate ? '' : row.version, content: normalizeRichText(row.content), status: duplicate ? 'DRAFT' : row.status} : blank());
  visible.value = true;
}
async function save() {
  if (!form.code.trim() || !form.title.trim() || !form.version.trim() || !hasRichTextContent(form.content)) return message.error('编码、标题、版本和内容均不能为空');
  saving.value = true;
  try {
    const data = {code: form.code.trim().toUpperCase(), title: form.title.trim(), version: form.version.trim(), content: form.content.trim(), status: form.status};
    editingId.value ? await updateAppDocumentApi(editingId.value, data) : await createAppDocumentApi(data);
    visible.value = false; message.success(data.status === 'PUBLISHED' ? '文档已发布' : '文档已保存'); await load();
  } finally { saving.value = false; }
}
function preview(row: AppDocument) { previewRow.value = row; previewVisible.value = true; }
const columns = [
  {title: '文档类型', key: 'code', width: 125, render: (row: AppDocument) => codeText(row.code)},
  {title: '标题', key: 'title', minWidth: 180}, {title: '版本', key: 'version', width: 90},
  {title: '状态', key: 'status', width: 90, render: (row: AppDocument) => h(NTag, {type: businessStatusType(row.status), bordered: false}, {default: () => businessStatusText(row.status)})},
  {title: '发布时间', key: 'publishedAt', width: 165, render: (row: AppDocument) => formatTime(row.publishedAt)},
  {title: '操作', key: 'operation', width: canUpdate ? 210 : 70, render: (row: AppDocument) => h(NSpace, {}, {default: () => [h(NButton, {size: 'small', onClick: () => preview(row)}, {default: () => '预览'}), ...(canUpdate ? [h(NButton, {size: 'small', onClick: () => open(row)}, {default: () => '编辑'}), h(NButton, {size: 'small', type: 'primary', secondary: true, onClick: () => open(row, true)}, {default: () => '新版本'})] : [])]})},
];
onMounted(load);
</script>

<template>
  <Page title="协议与关于" description="同一文档可保留多个版本，App 始终读取最近发布的版本">
    <NCard>
      <div class="mb-4 flex items-center gap-3"><NInput v-model:value="keyword" clearable placeholder="搜索类型、标题或版本" class="w-64" /><NButton v-if="canUpdate" type="primary" class="ml-auto" @click="open()">新增文档</NButton></div>
      <NDataTable :data="shownRows" :columns="columns" :loading="loading" :scroll-x="850" />
    </NCard>
    <NModal v-model:show="visible" preset="card" :title="editingId ? '编辑文档' : '创建文档版本'" class="modal-lg">
      <NForm label-placement="top">
        <div class="grid grid-cols-1 gap-x-4 md:grid-cols-2"><NFormItem label="文档类型"><NSelect v-model:value="form.code" tag filterable :options="codes" /></NFormItem><NFormItem label="版本"><NInput v-model:value="form.version" placeholder="例如 1.1" /></NFormItem></div>
        <NFormItem label="标题"><NInput v-model:value="form.title" maxlength="150" show-count /></NFormItem>
        <NFormItem label="内容">
          <div class="w-full">
            <VbenTiptap v-model="form.content" :image-upload="imageUpload" :min-height="220" :max-height="320" placeholder="请输入文档内容，可设置标题、列表、链接、颜色并插入图片" />
            <div v-if="!canUpload" class="mt-2 text-xs text-gray-500">当前账号没有图片上传权限，仍可使用文字、列表、链接等富文本功能。</div>
          </div>
        </NFormItem>
        <NFormItem label="状态"><NSelect v-model:value="form.status" :options="statuses" /></NFormItem>
      </NForm>
      <template #footer><div class="flex justify-end gap-2"><NButton @click="visible = false">取消</NButton><NButton type="primary" :loading="saving" @click="save">保存</NButton></div></template>
    </NModal>
    <NModal v-model:show="previewVisible" preset="card" :title="previewRow?.title || '文档预览'" class="modal-lg">
      <div v-if="previewRow"><div class="mb-4 text-sm text-gray-500">{{ codeText(previewRow.code) }} · 版本 {{ previewRow.version }}</div><VbenTiptapPreview :content="normalizeRichText(previewRow.content)" max-height="65vh" /></div>
    </NModal>
  </Page>
</template>
