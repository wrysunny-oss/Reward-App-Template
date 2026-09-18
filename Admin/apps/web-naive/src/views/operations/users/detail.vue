<script lang="ts" setup>
import type { CoinLedger, UserTeam } from '#/api';
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { Page } from '@vben/common-ui';
import { useAccess } from '@vben/access';
import { NButton, NCard, NDataTable, NDescriptions, NDescriptionsItem, NForm, NFormItem, NInput, NInputNumber, NModal, NSpace, NTag } from 'naive-ui';
import { message } from '#/adapter/naive';
import { adjustUserCoinsApi, getCoinLedgersApi, getUserDetailApi, getUserTeamApi, updateAgentShareRateApi, updateUserAdShareApi } from '#/api';
import { formatDateTime } from '#/utils/date-time';

defineOptions({ name: 'UserDetail' });
const route = useRoute();
const { hasAccessByCodes } = useAccess();
const userId = computed(() => String(route.params.id));
const user = ref<Awaited<ReturnType<typeof getUserDetailApi>>>();
const ledgers = ref<CoinLedger[]>([]);
const team = ref<UserTeam>();
const showAdjust = ref(false);
const showAdShare = ref(false);
const adSharePercent = ref<null | number>(null);
const showAgentShare = ref(false);
const agentSharePercent = ref(0);
const isAgent = computed(() => user.value?.roles.some((item) => item.role.code === 'level_one_agent') ?? false);
const submitting = ref(false);
const form = ref({ amount: null as null | number, reason: '' });

async function load() {
  const canReadCoins = hasAccessByCodes(['coin:read']);
  const [detail, ledgerPage, teamData] = await Promise.all([
    getUserDetailApi(userId.value),
    canReadCoins ? getCoinLedgersApi({ page: 1, pageSize: 20, userId: userId.value }) : Promise.resolve({ list: [] }),
    getUserTeamApi(userId.value),
  ]);
  user.value = detail;
  ledgers.value = ledgerPage.list;
  team.value = teamData;
}

async function submitAdjustment() {
  if (!form.value.amount || !form.value.reason.trim()) return message.warning('请填写调整数量和原因');
  submitting.value = true;
  try {
    await adjustUserCoinsApi(userId.value, { amount: String(form.value.amount), reason: form.value.reason.trim() });
    message.success('金币调整成功');
    showAdjust.value = false;
    form.value = { amount: null, reason: '' };
    await load();
  } finally { submitting.value = false; }
}

async function saveAdShare() {
  if (adSharePercent.value !== null && (adSharePercent.value < 0 || adSharePercent.value > 100)) return message.warning('分成比例必须在 0%-100% 之间');
  submitting.value = true;
  try {
    await updateUserAdShareApi(userId.value, adSharePercent.value === null ? null : Math.round(adSharePercent.value * 100));
    message.success(adSharePercent.value === null ? '已恢复继承全局比例' : '用户分成比例已更新');
    showAdShare.value = false;
    await load();
  } finally { submitting.value = false; }
}

async function saveAgentShare() {
  if (agentSharePercent.value < 0 || agentSharePercent.value > 100) return message.warning('代理分成比例必须在 0%-100% 之间');
  submitting.value = true;
  try {
    await updateAgentShareRateApi(userId.value, Math.round(agentSharePercent.value * 100));
    message.success('代理无限下级分成比例已更新');
    showAgentShare.value = false;
    await load();
  } finally { submitting.value = false; }
}

onMounted(load);
</script>

<template>
  <Page title="用户详情" description="账号资料、业务统计和金币流水">
    <NSpace vertical size="large">
      <NCard v-if="user" title="基本信息">
        <template #header-extra><NSpace><NButton v-if="hasAccessByCodes(['user:update'])" @click="adSharePercent = user.adShareRateBps == null ? null : user.adShareRateBps / 100; showAdShare = true">配置广告分成</NButton><NButton v-if="isAgent && hasAccessByCodes(['user:update'])" @click="agentSharePercent = (user.agentShareRateBps ?? 0) / 100; showAgentShare = true">配置代理分成</NButton><NButton v-if="hasAccessByCodes(['coin:adjust'])" type="primary" @click="showAdjust = true">人工调账</NButton></NSpace></template>
        <NDescriptions bordered :columns="3" label-placement="left">
          <NDescriptionsItem label="用户 ID">{{ user.id }}</NDescriptionsItem>
          <NDescriptionsItem label="手机号">{{ user.phone }}</NDescriptionsItem>
          <NDescriptionsItem label="昵称">{{ user.nickname }}</NDescriptionsItem>
          <NDescriptionsItem label="状态"><NTag :type="user.status === 'ACTIVE' ? 'success' : 'error'">{{ user.status === 'ACTIVE' ? '正常' : '禁用' }}</NTag></NDescriptionsItem>
          <NDescriptionsItem label="金币余额">{{ user.coinBalance }}</NDescriptionsItem>
          <NDescriptionsItem label="广告分成">{{ user.adShareRateBps == null ? '继承全局' : `${user.adShareRateBps / 100}%` }}</NDescriptionsItem>
          <NDescriptionsItem v-if="isAgent" label="代理无限下级分成">{{ (user.agentShareRateBps ?? 0) / 100 }}%</NDescriptionsItem>
          <NDescriptionsItem label="角色">{{ user.roles.map((item) => item.role.name).join('、') || '普通用户' }}</NDescriptionsItem>
          <NDescriptionsItem label="收藏数">{{ user._count.favorites }}</NDescriptionsItem>
          <NDescriptionsItem label="观看历史">{{ user._count.histories }}</NDescriptionsItem>
          <NDescriptionsItem label="流水数">{{ user._count.ledgers }}</NDescriptionsItem>
        </NDescriptions>
      </NCard>
      <NCard v-if="team" title="邀请团队（相对当前用户）">
        <NDescriptions bordered :columns="3"><NDescriptionsItem label="直推人数">{{ team.summary.directCount }}</NDescriptionsItem><NDescriptionsItem label="间推人数">{{ team.summary.indirectCount }}</NDescriptionsItem><NDescriptionsItem label="直推返佣">{{ team.summary.directCommissionCoins }}</NDescriptionsItem><NDescriptionsItem label="间推返佣">{{ team.summary.indirectCommissionCoins }}</NDescriptionsItem><NDescriptionsItem v-if="isAgent" label="无限下级佣金">{{ team.summary.agentCommissionCoins }}</NDescriptionsItem><NDescriptionsItem v-if="isAgent" label="代理佣金笔数">{{ team.summary.agentCommissionCount }}</NDescriptionsItem></NDescriptions>
        <NDataTable class="mt-4" :data="team.direct" :columns="[{title:'层级',key:'level',render:()=> '直推'}, {title:'用户',key:'user',render:(row:any)=>`${row.invitee.nickname} (${row.invitee.phone})`}, {title:'绑定时间',key:'createdAt',render:(row:any)=>formatDateTime(row.createdAt)}]" />
        <NDataTable class="mt-4" :data="team.indirect" :columns="[{title:'层级',key:'level',render:()=> '间推'}, {title:'上级',key:'parent',render:(row:any)=>row.inviter.nickname}, {title:'用户',key:'user',render:(row:any)=>`${row.invitee.nickname} (${row.invitee.phone})`}, {title:'绑定时间',key:'createdAt',render:(row:any)=>formatDateTime(row.createdAt)}]" />
      </NCard>
      <NCard v-if="hasAccessByCodes(['coin:read'])" title="最近金币流水">
        <NDataTable :data="ledgers" :columns="[
          { title: '时间', key: 'createdAt', render: (row: CoinLedger) => formatDateTime(row.createdAt) }, { title: '类型', key: 'type' },
          { title: '说明', key: 'title' }, { title: '变动', key: 'amount' }, { title: '变动后余额', key: 'balanceAfter' },
        ]" />
      </NCard>
    </NSpace>
    <NModal v-model:show="showAdjust" preset="card" title="人工调整金币" class="modal-sm">
      <NForm><NFormItem label="调整数量"><NInputNumber v-model:value="form.amount" placeholder="正数增加，负数扣减" /></NFormItem><NFormItem label="调整原因"><NInput v-model:value="form.reason" maxlength="100" show-count /></NFormItem></NForm>
      <template #footer><div class="flex justify-end"><NButton type="primary" :loading="submitting" @click="submitAdjustment">确认调整</NButton></div></template>
    </NModal>
    <NModal v-model:show="showAdShare" preset="card" title="用户广告分成" class="modal-sm">
      <NForm label-placement="top"><NFormItem label="独立分成比例（%）"><NInputNumber v-model:value="adSharePercent" :min="0" :max="100" :precision="2" clearable placeholder="留空则继承全局比例" /></NFormItem></NForm>
      <template #footer><div class="flex justify-end gap-2"><NButton @click="adSharePercent = null">改为继承全局</NButton><NButton type="primary" :loading="submitting" @click="saveAdShare">保存</NButton></div></template>
    </NModal>
    <NModal v-model:show="showAgentShare" preset="card" title="代理无限下级广告分成" class="modal-sm">
      <NForm label-placement="top"><NFormItem label="代理分成比例（%）"><NInputNumber v-model:value="agentSharePercent" :min="0" :max="100" :precision="2" class="w-full"><template #suffix>%</template></NInputNumber></NFormItem></NForm>
      <div class="text-gray-500">该代理邀请树中所有层级用户观看广告时，平台按此比例额外向代理发放佣金，不减少观看用户及直推、间推收益。</div>
      <template #footer><div class="flex justify-end"><NButton type="primary" :loading="submitting" @click="saveAgentShare">保存</NButton></div></template>
    </NModal>
  </Page>
</template>
