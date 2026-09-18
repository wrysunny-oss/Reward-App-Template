<script lang="ts" setup>
import type { WithdrawalConfig } from '#/api';

import { computed, onMounted, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import {
  NAlert,
  NButton,
  NCard,
  NForm,
  NFormItem,
  NGrid,
  NGridItem,
  NInput,
  NInputNumber,
  NSpace,
  NSwitch,
  NTag,
  useMessage,
} from 'naive-ui';

import {
  getWithdrawalConfigApi,
  updateWithdrawalConfigApi,
} from '#/api';

defineOptions({ name: 'WithdrawalConfig' });

const message = useMessage();
const { hasAccessByCodes } = useAccess();
const canUpdate = hasAccessByCodes(['withdrawal:config']);
const loading = ref(false);
const tierText = ref('10000\n50000\n100000\n500000\n1000000');
const form = reactive<WithdrawalConfig>({
  enabled: true,
  coinsPerCent: 100,
  minCoins: '10000',
  maxCoins: '1000000',
  tiers: ['10000', '50000', '100000', '500000', '1000000'],
  dailyCountLimit: 3,
  dailyCoinLimit: '2000000',
  feeRateBps: 0,
});

/** 使用 BigInt 换算展示金额，避免大额金币经过 Number 时发生精度丢失。 */
function coinsToYuan(coins: string) {
  if (!/^\d+$/.test(coins) || form.coinsPerCent <= 0) return '--';
  const cents = BigInt(coins) / BigInt(form.coinsPerCent);
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}

const exchangeExample = computed(
  () => `${(form.coinsPerCent * 100).toLocaleString('zh-CN')} 金币 = 1.00 元`,
);
const feePercent = computed(() => `${(form.feeRateBps / 100).toFixed(2)}%`);

async function load() {
  const result = await getWithdrawalConfigApi();
  Object.assign(form, result);
  tierText.value = result.tiers.join('\n');
}

async function save() {
  const tiers = tierText.value.split(/[\s,，]+/).map((value) => value.trim()).filter(Boolean);
  const values = [...tiers, form.dailyCoinLimit];
  if (!values.every((value) => /^\d+$/.test(value) && BigInt(value) > 0n)) {
    return message.error('金币数量必须是大于 0 的整数');
  }
  if (tiers.length < 1 || tiers.length > 20) {
    return message.error('请设置 1 至 20 个提现档位');
  }
  if (new Set(tiers).size !== tiers.length) {
    return message.error('提现档位不能重复');
  }
  tiers.sort((left, right) => BigInt(left) < BigInt(right) ? -1 : BigInt(left) > BigInt(right) ? 1 : 0);
  form.tiers = tiers;
  form.minCoins = tiers[0]!;
  form.maxCoins = tiers[tiers.length - 1]!;
  loading.value = true;
  try {
    await updateWithdrawalConfigApi({ ...form });
    message.success('提现规则已更新');
    await load();
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <Page
    title="提现规则"
    description="统一配置金币兑换、单笔限制、每日额度和手续费"
  >
    <NForm label-placement="top">
      <NCard class="mb-4" content-class="!py-4">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <NSpace align="center" :size="16">
            <div>
              <div class="mb-1 text-base font-medium">提现服务状态</div>
              <div class="text-sm text-gray-500">
                关闭后 APP 将暂停提交新的提现申请，不影响已有订单处理
              </div>
            </div>
            <NTag :type="form.enabled ? 'success' : 'warning'" round>
              {{ form.enabled ? '开放中' : '已关闭' }}
            </NTag>
          </NSpace>
          <NSwitch
            v-model:value="form.enabled"
            :disabled="!canUpdate"
            size="large"
          >
            <template #checked>开放</template>
            <template #unchecked>关闭</template>
          </NSwitch>
        </div>
      </NCard>

      <NAlert type="info" class="mb-4" :bordered="false">
        当前兑换示例：{{ exchangeExample }}。金额统一以人民币分结算，页面换算为元便于核对。
      </NAlert>

      <NGrid
        cols="1 m:2 xl:3"
        responsive="screen"
        :x-gap="16"
        :y-gap="16"
      >
        <NGridItem>
          <NCard title="兑换与费用" class="h-full" size="small">
            <template #header-extra><NTag size="small" type="info">基础规则</NTag></template>
            <NFormItem label="每人民币分所需金币">
              <NInputNumber
                v-model:value="form.coinsPerCent"
                :disabled="!canUpdate"
                :min="1"
                :max="1000000"
                class="w-full"
              ><template #suffix>金币 / 分</template></NInputNumber>
              <template #feedback>决定金币与人民币的基础兑换关系</template>
            </NFormItem>
            <NFormItem label="提现手续费">
              <NInputNumber
                v-model:value="form.feeRateBps"
                :disabled="!canUpdate"
                :min="0"
                :max="10000"
                class="w-full"
              ><template #suffix>万分比</template></NInputNumber>
              <template #feedback>当前折合 {{ feePercent }}</template>
            </NFormItem>
          </NCard>
        </NGridItem>

        <NGridItem>
          <NCard title="固定提现档位" class="h-full" size="small">
            <template #header-extra><NTag size="small">APP 单选</NTag></template>
            <NFormItem label="档位金币数">
              <NInput
                v-model:value="tierText"
                :disabled="!canUpdate"
                type="textarea"
                :autosize="{ minRows: 4, maxRows: 7 }"
                placeholder="每行一个档位，例如 10000"
              />
              <template #feedback>支持换行或逗号分隔，保存后自动从小到大排列，APP 只能选择这些档位</template>
            </NFormItem>
            <NSpace v-if="form.tiers.length" size="small" wrap>
              <NTag v-for="tier in form.tiers" :key="tier" size="small" type="info">
                {{ Number(tier).toLocaleString('zh-CN') }} 金币 / ¥{{ coinsToYuan(tier) }}
              </NTag>
            </NSpace>
          </NCard>
        </NGridItem>

        <NGridItem>
          <NCard title="每日提现限制" class="h-full" size="small">
            <template #header-extra><NTag size="small">自然日</NTag></template>
            <NFormItem label="每日提现次数上限">
              <NInputNumber
                v-model:value="form.dailyCountLimit"
                :disabled="!canUpdate"
                :min="1"
                :max="100"
                class="w-full"
              ><template #suffix>次 / 日</template></NInputNumber>
              <template #feedback>按北京时间自然日重新计算</template>
            </NFormItem>
            <NFormItem label="每日累计金币上限">
              <NInput v-model:value="form.dailyCoinLimit" :disabled="!canUpdate" placeholder="请输入正整数">
                <template #suffix>金币</template>
              </NInput>
              <template #feedback>约 {{ coinsToYuan(form.dailyCoinLimit) }} 元 / 日</template>
            </NFormItem>
          </NCard>
        </NGridItem>
      </NGrid>

      <NCard class="mt-4" content-class="!py-4">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div class="text-sm text-gray-500">
            保存后立即应用于新的提现申请，已有提现订单仍按创建时金额继续处理。
          </div>
          <NButton
            v-if="canUpdate"
            type="primary"
            size="large"
            :loading="loading"
            @click="save"
          >
            保存提现规则
          </NButton>
        </div>
      </NCard>
    </NForm>
  </Page>
</template>
