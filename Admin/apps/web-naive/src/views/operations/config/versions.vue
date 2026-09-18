<script lang="ts" setup>
import type { AppVersion } from '#/api';

import { computed, h, onMounted, reactive, ref } from 'vue';
import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { NAlert, NButton, NCard, NDataTable, NDatePicker, NForm, NFormItem, NInput, NInputNumber, NModal, NProgress, NSelect, NSwitch, NTag, useMessage } from 'naive-ui';

import { createAppVersionApi, getAppVersionsApi, updateAppVersionApi } from '#/api';

defineOptions({name: 'AppVersions'});
const message = useMessage();
const {hasAccessByCodes} = useAccess();
const canUpdate = hasAccessByCodes(['operation:update']);
const rows = ref<AppVersion[]>([]);
const loading = ref(false);
const saving = ref(false);
const visible = ref(false);
const editingId = ref('');
const publishAt = ref<number | null>(null);
const blank = (): Omit<AppVersion, 'id'> => ({platform: 'ANDROID', versionName: '1.0.0', versionCode: 1, minVersionCode: 1, downloadUrl: '', releaseNotes: '', enabled: false, rolloutPercent: 100, publishedAt: null});
const form = reactive<Omit<AppVersion, 'id'>>(blank());
const isForceRelease = computed(() => form.minVersionCode === form.versionCode);
const formatTime = (value?: null | string) => value ? new Date(value).toLocaleString('zh-CN', {hour12: false}) : '未发布';
function releaseStatus(row: AppVersion) {
  if (!row.enabled) return {label: '已停用', type: 'default' as const};
  if (!row.publishedAt) return {label: '待发布', type: 'warning' as const};
  if (new Date(row.publishedAt).getTime() > Date.now()) return {label: '定时发布', type: 'info' as const};
  return {label: '发布中', type: 'success' as const};
}
async function load() { loading.value = true; try { rows.value = await getAppVersionsApi(); } finally { loading.value = false; } }
function open(row?: AppVersion) {
  editingId.value = row?.id ?? '';
  Object.assign(form, row ? {...row} : blank());
  publishAt.value = row?.publishedAt ? new Date(row.publishedAt).getTime() : null;
  visible.value = true;
}
function validate() {
  if (!/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(form.versionName.trim())) return '版本名称建议使用 1.2.3 格式';
  if (form.minVersionCode > form.versionCode) return '最低兼容版本号不能高于当前版本号';
  if (!/^https:\/\//i.test(form.downloadUrl)) return '下载地址必须使用 HTTPS';
  if (!form.releaseNotes.trim()) return '请输入更新说明';
  if (form.enabled && !publishAt.value) return '启用版本前必须设置发布时间';
  return '';
}
async function save() {
  const error = validate(); if (error) return message.error(error);
  saving.value = true;
  try {
    const data = {...form, versionName: form.versionName.trim(), downloadUrl: form.downloadUrl.trim(), releaseNotes: form.releaseNotes.trim(), publishedAt: publishAt.value ? new Date(publishAt.value).toISOString() : null};
    editingId.value ? await updateAppVersionApi(editingId.value, data) : await createAppVersionApi(data);
    visible.value = false; message.success('版本策略已保存'); await load();
  } finally { saving.value = false; }
}
async function toggle(row: AppVersion) {
  await updateAppVersionApi(row.id, {...row, enabled: !row.enabled});
  message.success(row.enabled ? '版本策略已停用' : '版本策略已启用'); await load();
}
const columns = [
  {title: '平台', key: 'platform', width: 90, render: (row: AppVersion) => row.platform === 'ANDROID' ? 'Android' : 'iOS'},
  {title: '版本', key: 'versionName', width: 110}, {title: '版本号', key: 'versionCode', width: 90},
  {title: '升级策略', key: 'force', width: 100, render: (row: AppVersion) => h(NTag, {type: row.minVersionCode === row.versionCode ? 'error' : 'info', bordered: false}, {default: () => row.minVersionCode === row.versionCode ? '强制升级' : `最低 ${row.minVersionCode}`})},
  {title: '灰度比例', key: 'rolloutPercent', width: 140, render: (row: AppVersion) => h(NProgress, {percentage: row.rolloutPercent, height: 10, indicatorPlacement: 'inside'})},
  {title: '发布时间', key: 'publishedAt', minWidth: 165, render: (row: AppVersion) => formatTime(row.publishedAt)},
  {title: '状态', key: 'status', width: 95, render: (row: AppVersion) => {const status = releaseStatus(row); return h(NTag, {type: status.type, bordered: false}, {default: () => status.label});}},
  ...(canUpdate ? [{title: '操作', key: 'operation', width: 145, render: (row: AppVersion) => h('div', {class: 'flex gap-2'}, [h(NButton, {size: 'small', onClick: () => open(row)}, {default: () => '编辑'}), h(NButton, {size: 'small', type: row.enabled ? 'warning' : 'success', onClick: () => toggle(row)}, {default: () => row.enabled ? '停用' : '启用'})])}] : []),
];
onMounted(load);
</script>

<template>
  <Page title="App 版本" description="维护下载地址、灰度范围、定时发布和强制升级策略">
    <NAlert class="mb-4" type="info" :bordered="false">最低兼容版本号等于当前版本号时，该版本对所有更低版本执行强制升级；灰度比例按设备稳定分桶。</NAlert>
    <NCard>
      <div v-if="canUpdate" class="mb-4 flex justify-end"><NButton type="primary" @click="open()">新增版本</NButton></div>
      <NDataTable :data="rows" :columns="columns" :loading="loading" :scroll-x="950" />
    </NCard>
    <NModal v-model:show="visible" preset="card" :title="editingId ? '编辑版本策略' : '新增版本策略'">
      <NForm label-placement="left" label-width="110">
        <NFormItem label="平台"><NSelect v-model:value="form.platform" :options="[{label:'Android',value:'ANDROID'},{label:'iOS',value:'IOS'}]" /></NFormItem>
        <NFormItem label="版本名称"><NInput v-model:value="form.versionName" placeholder="例如 1.2.3" /></NFormItem>
        <NFormItem label="当前版本号"><NInputNumber v-model:value="form.versionCode" :min="1" class="w-full" /></NFormItem>
        <NFormItem label="最低兼容版本"><NInputNumber v-model:value="form.minVersionCode" :min="1" :max="form.versionCode" class="w-full" /></NFormItem>
        <NFormItem label="升级说明"><NTag :type="isForceRelease ? 'error' : 'info'">{{ isForceRelease ? '当前配置为强制升级' : `低于 ${form.minVersionCode} 的版本强制升级` }}</NTag></NFormItem>
        <NFormItem label="APK 下载地址"><NInput v-model:value="form.downloadUrl" placeholder="https://example.com/app.apk" /></NFormItem>
        <NFormItem label="灰度比例"><NInputNumber v-model:value="form.rolloutPercent" :min="0" :max="100" :step="5" class="w-full"><template #suffix>%</template></NInputNumber></NFormItem>
        <NFormItem label="发布时间"><NDatePicker v-model:value="publishAt" type="datetime" clearable class="w-full" /></NFormItem>
        <NFormItem label="启用"><NSwitch v-model:value="form.enabled" /></NFormItem>
        <NFormItem label="更新说明"><NInput v-model:value="form.releaseNotes" type="textarea" :rows="7" maxlength="20000" show-count /></NFormItem>
      </NForm>
      <template #footer><div class="flex justify-end gap-2"><NButton @click="visible = false">取消</NButton><NButton type="primary" :loading="saving" @click="save">保存</NButton></div></template>
    </NModal>
  </Page>
</template>
