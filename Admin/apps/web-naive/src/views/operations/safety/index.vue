<script lang="ts" setup>
import type { DataTableColumns } from 'naive-ui';

import type {
  DeviceRiskAssessment,
  FeedbackTicket,
  RiskBreakdown,
  RiskDashboard,
  RiskEvent,
  RiskPolicy,
  RiskRule,
  RiskRuleCatalog,
  UserReport,
} from '#/api';

import { h, onMounted, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import {
  NAlert,
  NButton,
  NCard,
  NDataTable,
  NDescriptions,
  NDescriptionsItem,
  NForm,
  NFormItem,
  NGrid,
  NGridItem,
  NInput,
  NInputNumber,
  NModal,
  NPagination,
  NSelect,
  NSpace,
  NStatistic,
  NSwitch,
  NTabPane,
  NTabs,
  NTag,
  useMessage,
} from 'naive-ui';

import {
  getDeviceRiskAssessmentsApi,
  getFeedbackTicketsApi,
  getReportsApi,
  getRiskDashboardApi,
  getRiskEventsApi,
  getRiskPolicyApi,
  getRiskRulesApi,
  handleFeedbackTicketApi,
  handleReportApi,
  handleRiskEventApi,
  updateRiskPolicyApi,
  updateUserRiskApi,
} from '#/api';
import {
  businessStatusText,
  businessStatusType,
} from '#/utils/business-status';
import { formatDateTime } from '#/utils/date-time';

defineOptions({ name: 'SafetyCenterPage' });
const message = useMessage();
const { hasAccessByCodes } = useAccess();
const canUpdateRisk = hasAccessByCodes(['risk:update']);
const canUpdateFeedback = hasAccessByCodes(['feedback:update']);
const canUpdateReport = hasAccessByCodes(['report:update']);
const feedback = ref<FeedbackTicket[]>([]);
const reports = ref<UserReport[]>([]);
const risks = ref<RiskEvent[]>([]);
const assessments = ref<DeviceRiskAssessment[]>([]);
const dashboard = ref<RiskDashboard>();
const ruleCatalog = ref<RiskRuleCatalog>();
const selectedAssessment = ref<DeviceRiskAssessment>();
const detailVisible = ref(false);
const ticketVisible = ref(false);
const reportVisible = ref(false);
const ticketSaving = ref(false);
const reportSaving = ref(false);
const tableLoading = ref(false);
const riskActionVisible = ref(false);
const userRiskVisible = ref(false);
const riskActionSaving = ref(false);
const userRiskSaving = ref(false);
const selectedTicket = ref<FeedbackTicket>();
const selectedReport = ref<UserReport>();
const selectedRisk = ref<RiskEvent>();
const selectedRiskUser = ref<{id:string;nickname:string;phone:string;riskStatus:string}>();
const ticketForm = reactive({status: 'PROCESSING', reply: '', internalNote: ''});
const reportForm = reactive({status: 'PROCESSING', disposition: '', remark: ''});
const riskActionForm = reactive({status:'CONFIRMED' as 'CONFIRMED'|'IGNORED',remark:''});
const userRiskForm = reactive({riskStatus:'BANNED' as 'BANNED'|'NORMAL',riskRemark:''});
const feedbackStatusOptions = [{label:'处理中',value:'PROCESSING'},{label:'已解决',value:'RESOLVED'},{label:'已关闭',value:'CLOSED'}];
const reportStatusOptions = [{label:'处理中',value:'PROCESSING'},{label:'举报有效',value:'VALID'},{label:'举报无效',value:'INVALID'},{label:'已关闭',value:'CLOSED'}];
const feedbackQuery = reactive({page:1,pageSize:20,total:0,status:undefined as string|undefined});
const reportQuery = reactive({page:1,pageSize:20,total:0,status:undefined as string|undefined});
const riskQuery = reactive({page:1,pageSize:20,total:0,status:undefined as string|undefined});
const assessmentQuery = reactive({page:1,pageSize:20,total:0});
const feedbackFilterOptions = [{label:'待处理',value:'PENDING'},...feedbackStatusOptions];
const reportFilterOptions = [{label:'待处理',value:'PENDING'},...reportStatusOptions];
const riskFilterOptions = [{label:'待处理',value:'PENDING'},{label:'已确认',value:'CONFIRMED'},{label:'已忽略',value:'IGNORED'}];
const policy = ref<RiskPolicy>({
  enabled: true,
  requireFreshAssessment: false,
  minKnownChecks: 6,
  autoBanThreshold: 60,
  warningThreshold: 80,
  nearbyRadiusMeters: 150,
  nearbyDeviceThreshold: 5,
  presenceWindowMinutes: 10,
  maxLocationAccuracyMeters: 50,
  maxLocationAgeSeconds: 120,
  locationRetentionHours: 24,
  loginValidityHours: 24,
  rewardValidityMinutes: 360,
  withdrawalValidityMinutes: 10,
  multiAccountDeviceThreshold: 3,
  multiAccountIpThreshold: 10,
});
const savingPolicy = ref(false);
const riskStatusText: Record<string, string> = {
  PASS: '通过',
  RISK: '风险',
  UNKNOWN: '未知',
};
const riskStatusType = (status: string) =>
  status === 'RISK' ? 'error' : status === 'PASS' ? 'success' : 'default';
const statusTag = (status: string) =>
  h(
    NTag,
    { type: businessStatusType(status) },
    { default: () => businessStatusText(status) },
  );
const feedbackColumns: DataTableColumns<FeedbackTicket> = [
  {
    title: '时间',
    key: 'createdAt',
    render: (r) => formatDateTime(r.createdAt),
  },
  {
    title: '用户',
    key: 'user',
    render: (r) => (r.user ? `${r.user.nickname} (${r.user.phone})` : '匿名'),
  },
  { title: '类型', key: 'type' },
  { title: '内容', key: 'content' },
  { title: '状态', key: 'status', render: (r) => statusTag(r.status) },
  {
    title: '操作',
    key: 'op',
    render: (r) =>
      h(
        NButton,
        { size: 'small', onClick: () => openTicket(r) },
        { default: () => canUpdateFeedback ? '处理工单' : '查看详情' },
      ),
  },
];
const reportColumns: DataTableColumns<UserReport> = [
  {
    title: '时间',
    key: 'createdAt',
    render: (r) => formatDateTime(r.createdAt),
  },
  {
    title: '用户',
    key: 'user',
    render: (r) => `${r.user.nickname} (${r.user.phone})`,
  },
  { title: '目标', key: 'targetType' },
  { title: '内容', key: 'content' },
  { title: '状态', key: 'status', render: (r) => statusTag(r.status) },
  {
    title: '操作',
    key: 'op',
    render: (r) => h(NButton, {size:'small',onClick:()=>openReport(r)}, {default:()=>canUpdateReport?'处理举报':'查看详情'}),
  },
];
const riskColumns: DataTableColumns<RiskEvent> = [
  {
    title: '时间',
    key: 'createdAt',
    render: (r) => formatDateTime(r.createdAt),
  },
  { title: '等级', key: 'level', render: (r) => statusTag(r.level) },
  { title: '规则', key: 'ruleCode' },
  { title: '标题', key: 'title' },
  { title: '状态', key: 'status', render: (r) => statusTag(r.status) },
  {
    title: '操作',
    key: 'op',
    render: (r) =>
      h(
        NSpace,
        {},
        {
          default: () => [
            h(
              NButton,
              {
                size: 'small',
                type: 'warning',
                disabled: !canUpdateRisk,
                onClick: () => openRiskAction(r, 'CONFIRMED'),
              },
              { default: () => '确认风险' },
            ),
            h(
              NButton,
              { size: 'small', disabled: !canUpdateRisk, onClick: () => openRiskAction(r, 'IGNORED') },
              { default: () => '忽略' },
            ),
            r.user
              ? h(
                  NButton,
                  {
                    size: 'small',
                    type: 'error',
                    disabled: r.user.riskStatus === 'BANNED',
                    onClick: () => openUserRisk(r.user!),
                  },
                  {
                    default: () =>
                      r.user?.riskStatus === 'BANNED' ? '已封号' : '主动封号',
                  },
                )
              : null,
          ],
        },
      ),
  },
];
const assessmentColumns: DataTableColumns<DeviceRiskAssessment> = [
  {
    title: '时间',
    key: 'createdAt',
    render: (r) => formatDateTime(r.createdAt),
  },
  {
    title: '用户',
    key: 'user',
    render: (r) => `${r.user.nickname} (${r.user.phone})`,
  },
  {
    title: '评分',
    key: 'score',
    render: (r) =>
      h(
        NTag,
        {
          type:
            r.score < r.policy.autoBanThreshold
              ? 'error'
              : r.score < r.policy.warningThreshold
                ? 'warning'
                : 'success',
        },
        { default: () => `${r.score} 分` },
      ),
  },
  {
    title: '有效检测',
    key: 'knownChecks',
    render: (r) => `${r.knownChecks}/10`,
  },
  {
    title: '处理',
    key: 'autoBanned',
    render: (r) => (r.autoBanned ? '自动封号' : '未封号'),
  },
  { title: '设备 ID', key: 'deviceId', ellipsis: { tooltip: true } },
  { title: 'IP', key: 'ip' },
  {
    title: '附近活跃设备',
    key: 'nearbyDeviceCount',
    render: (r) =>
      r.nearbyDeviceCount == null
        ? '无法判断'
        : `${r.nearbyDeviceCount} 台 / ${r.nearbyRadiusMeters ?? r.policy.nearbyRadiusMeters} 米`,
  },
  {
    title: '操作',
    key: 'op',
    render: (r) =>
      h(
        NSpace,
        {},
        {
          default: () => [
            h(
              NButton,
              { size: 'small', onClick: () => showAssessmentDetail(r) },
              { default: () => '查看扣分明细' },
            ),
            ...(canUpdateRisk
              ? [
                  h(
                    NButton,
                    {
                      size: 'small',
                      type:
                        r.user.riskStatus === 'BANNED' ? 'primary' : 'error',
                      onClick: () => openUserRisk(r.user),
                    },
                    {
                      default: () =>
                        r.user.riskStatus === 'BANNED'
                          ? '解除封号'
                          : '主动封号',
                    },
                  ),
                ]
              : []),
          ],
        },
      ),
  },
];
const ruleColumns: DataTableColumns<RiskRule> = [
  { title: '检测项', key: 'name', width: 150 },
  { title: '数据来源', key: 'source', width: 190 },
  { title: '通过条件', key: 'passCondition', minWidth: 220 },
  { title: '扣分条件', key: 'riskCondition', minWidth: 240 },
  {
    title: '风险扣分',
    key: 'deduction',
    width: 100,
    render: (row) => `-${row.deduction} 分`,
  },
  { title: '无法判断时', key: 'unknownHandling', minWidth: 230 },
];
const breakdownColumns: DataTableColumns<RiskBreakdown> = [
  { title: '检测项', key: 'name', width: 135 },
  {
    title: '结果',
    key: 'status',
    width: 80,
    render: (row) =>
      h(
        NTag,
        { type: riskStatusType(row.status) },
        { default: () => riskStatusText[row.status] ?? row.status },
      ),
  },
  {
    title: '扣分',
    key: 'deduction',
    width: 75,
    render: (row) => (row.deduction > 0 ? `-${row.deduction}` : '0'),
  },
  { title: '判定原因', key: 'reason', minWidth: 360 },
  { title: '证据来源', key: 'source', minWidth: 190 },
];

function showAssessmentDetail(row: DeviceRiskAssessment) {
  selectedAssessment.value = row;
  detailVisible.value = true;
}

async function loadFeedback() {const value=await getFeedbackTicketsApi(feedbackQuery);feedback.value=value.list;feedbackQuery.total=value.total;}
async function loadReports() {const value=await getReportsApi(reportQuery);reports.value=value.list;reportQuery.total=value.total;}
async function loadRisks() {const value=await getRiskEventsApi(riskQuery);risks.value=value.list;riskQuery.total=value.total;}
async function loadAssessments() {const value=await getDeviceRiskAssessmentsApi(assessmentQuery);assessments.value=value.list;assessmentQuery.total=value.total;}
async function load() {
  tableLoading.value=true;
  try {
  const [a, b, c, d, e, f, g] = await Promise.all([
    getFeedbackTicketsApi(feedbackQuery),
    getReportsApi(reportQuery),
    getRiskEventsApi(riskQuery),
    getDeviceRiskAssessmentsApi(assessmentQuery),
    getRiskDashboardApi(),
    getRiskPolicyApi(),
    getRiskRulesApi(),
  ]);
  feedback.value = a.list;
  feedbackQuery.total = a.total;
  reports.value = b.list;
  reportQuery.total = b.total;
  risks.value = c.list;
  riskQuery.total = c.total;
  assessments.value = d.list;
  assessmentQuery.total = d.total;
  dashboard.value = e;
  policy.value = f;
  ruleCatalog.value = g;
  } finally {tableLoading.value=false;}
}
function openTicket(row: FeedbackTicket) {
  selectedTicket.value = row;
  ticketForm.status = row.status === 'PENDING' ? 'PROCESSING' : row.status;
  ticketForm.reply = row.reply ?? '';
  ticketForm.internalNote = row.internalNote ?? '';
  ticketVisible.value = true;
}
async function submitTicket() {
  if (!selectedTicket.value) return;
  if (ticketForm.status === 'RESOLVED' && !ticketForm.reply.trim()) return message.warning('解决工单时必须填写用户可见回复');
  ticketSaving.value = true;
  try {
    await handleFeedbackTicketApi(selectedTicket.value.id, {status:ticketForm.status, reply:ticketForm.reply.trim(), internalNote:ticketForm.internalNote.trim()});
    message.success('工单进度已更新，用户将收到站内信');
    ticketVisible.value = false;
    await loadFeedback();
  } finally { ticketSaving.value = false; }
}
function openReport(row: UserReport) {
  selectedReport.value = row;
  reportForm.status = row.status === 'PENDING' ? 'PROCESSING' : row.status;
  reportForm.disposition = row.disposition ?? '';
  reportForm.remark = row.remark ?? '';
  reportVisible.value = true;
}
async function submitReport() {
  if (!selectedReport.value) return;
  if (reportForm.status !== 'PROCESSING' && !reportForm.remark.trim()) return message.warning('完成举报判定时必须填写用户可见说明');
  reportSaving.value = true;
  try {
    await handleReportApi(selectedReport.value.id, {status:reportForm.status, disposition:reportForm.disposition.trim(), remark:reportForm.remark.trim()});
    message.success('举报进度已更新，用户将收到站内信');
    reportVisible.value = false;
    await loadReports();
  } finally { reportSaving.value = false; }
}
function openRiskAction(row:RiskEvent,status:'CONFIRMED'|'IGNORED'){selectedRisk.value=row;riskActionForm.status=status;riskActionForm.remark='';riskActionVisible.value=true;}
async function submitRiskAction(){if(!selectedRisk.value)return;if(riskActionForm.remark.trim().length<2)return message.warning('请输入至少 2 个字的处理备注');riskActionSaving.value=true;try{await handleRiskEventApi(selectedRisk.value.id,{status:riskActionForm.status,remark:riskActionForm.remark.trim()});message.success('风险事件已处理并记录审计日志');riskActionVisible.value=false;await Promise.all([loadRisks(),getRiskDashboardApi().then(value=>dashboard.value=value)]);}finally{riskActionSaving.value=false;}}
function openUserRisk(user:{id:string;nickname:string;phone:string;riskStatus:string}){selectedRiskUser.value=user;userRiskForm.riskStatus=user.riskStatus==='BANNED'?'NORMAL':'BANNED';userRiskForm.riskRemark='';userRiskVisible.value=true;}
async function submitUserRisk(){if(!selectedRiskUser.value)return;if(userRiskForm.riskRemark.trim().length<2)return message.warning('请输入至少 2 个字的操作原因');userRiskSaving.value=true;try{await updateUserRiskApi(selectedRiskUser.value.id,{riskStatus:userRiskForm.riskStatus,riskRemark:userRiskForm.riskRemark.trim()});message.success(userRiskForm.riskStatus==='BANNED'?'用户已封号':'已解除封号');userRiskVisible.value=false;await Promise.all([loadRisks(),loadAssessments(),getRiskDashboardApi().then(value=>dashboard.value=value)]);}finally{userRiskSaving.value=false;}}
async function savePolicy() {
  if (policy.value.warningThreshold < policy.value.autoBanThreshold)
    return message.warning('预警阈值不能低于自动封号阈值');
  savingPolicy.value = true;
  try {
    await updateRiskPolicyApi(policy.value);
    message.success('风控策略已保存');
    await load();
  } finally {
    savingPolicy.value = false;
  }
}
onMounted(load);
</script>

<template>
  <Page
    title="反薅与风控处置中心"
    description="设备评分、关联账号识别、风险处置和策略配置"
  >
    <NGrid v-if="dashboard" cols="2 s:3 l:7" responsive="screen" :x-gap="12" :y-gap="12" class="mb-4">
      <NGridItem><NCard><NStatistic label="检测次数" :value="dashboard.totalAssessments" /></NCard></NGridItem>
      <NGridItem><NCard><NStatistic label="平均评分" :value="dashboard.averageScore.toFixed(1)" /></NCard></NGridItem>
      <NGridItem><NCard><NStatistic label="预警检测" :value="dashboard.warningAssessments" /></NCard></NGridItem>
      <NGridItem><NCard><NStatistic label="自动封号" :value="dashboard.autoBanned" /></NCard></NGridItem>
      <NGridItem><NCard><NStatistic label="待处理风险" :value="dashboard.pendingEvents" /></NCard></NGridItem>
      <NGridItem><NCard><NStatistic label="待处理反馈" :value="dashboard.feedbackPending" /></NCard></NGridItem>
      <NGridItem><NCard><NStatistic label="待处理举报" :value="dashboard.reportPending" /></NCard></NGridItem>
    </NGrid>
    <NCard>
<NTabs type="line">
<NTabPane name="feedback" tab="反馈工单">
<div class="table-toolbar"><NSelect v-model:value="feedbackQuery.status" clearable placeholder="全部状态" :options="feedbackFilterOptions" @update:value="feedbackQuery.page = 1; loadFeedback()" /><span>共 {{ feedbackQuery.total }} 条</span></div>
<NDataTable :data="feedback" :columns="feedbackColumns" :loading="tableLoading" :scroll-x="900" />
<div class="table-pagination"><NPagination v-model:page="feedbackQuery.page" v-model:page-size="feedbackQuery.pageSize" :item-count="feedbackQuery.total" show-size-picker :page-sizes="[10,20,50]" @update:page="loadFeedback" @update:page-size="feedbackQuery.page = 1; loadFeedback()" /></div>
</NTabPane><NTabPane name="reports" tab="用户举报">
<div class="table-toolbar"><NSelect v-model:value="reportQuery.status" clearable placeholder="全部状态" :options="reportFilterOptions" @update:value="reportQuery.page = 1; loadReports()" /><span>共 {{ reportQuery.total }} 条</span></div>
<NDataTable :data="reports" :columns="reportColumns" :loading="tableLoading" :scroll-x="900" />
<div class="table-pagination"><NPagination v-model:page="reportQuery.page" v-model:page-size="reportQuery.pageSize" :item-count="reportQuery.total" show-size-picker :page-sizes="[10,20,50]" @update:page="loadReports" @update:page-size="reportQuery.page = 1; loadReports()" /></div>
</NTabPane><NTabPane name="risks" tab="风险事件">
<div class="table-toolbar"><NSelect v-model:value="riskQuery.status" clearable placeholder="全部状态" :options="riskFilterOptions" @update:value="riskQuery.page = 1; loadRisks()" /><span>共 {{ riskQuery.total }} 条</span></div>
<NDataTable :data="risks" :columns="riskColumns" :loading="tableLoading" :scroll-x="1000" />
<div class="table-pagination"><NPagination v-model:page="riskQuery.page" v-model:page-size="riskQuery.pageSize" :item-count="riskQuery.total" show-size-picker :page-sizes="[10,20,50]" @update:page="loadRisks" @update:page-size="riskQuery.page = 1; loadRisks()" /></div>
</NTabPane><NTabPane name="rules" tab="具体规则与扣分项">
          <NAlert v-if="ruleCatalog" type="info" class="mb-4">
            <div>评分从 {{ ruleCatalog.baseScore }} 分开始，共 {{ ruleCatalog.totalChecks }} 项；每命中一项风险扣 {{ ruleCatalog.scorePerRisk }} 分。</div>
            <div class="mt-1">{{ ruleCatalog.decision }}。未知项不会扣分，但会降低本次检测的可信度。</div>
          </NAlert>
          <NDataTable
            :columns="ruleColumns"
            :data="ruleCatalog?.rules ?? []"
            :scroll-x="1150"
          />
        </NTabPane><NTabPane name="device-risk" tab="设备环境评分">
<NDataTable
            :data="assessments"
            :columns="assessmentColumns"
            :scroll-x="1100"
            :loading="tableLoading"
        />
<div class="table-pagination"><NPagination v-model:page="assessmentQuery.page" v-model:page-size="assessmentQuery.pageSize" :item-count="assessmentQuery.total" show-size-picker :page-sizes="[10,20,50]" @update:page="loadAssessments" @update:page-size="assessmentQuery.page = 1; loadAssessments()" /></div>
</NTabPane>
        <NTabPane name="policy" tab="风控策略">
          <NAlert type="info" :bordered="false" class="mb-4">
            当前策略：至少 {{ policy.minKnownChecks }} 项检测有效后参与判定；低于
            {{ policy.autoBanThreshold }} 分自动封号，低于
            {{ policy.warningThreshold }} 分触发预警。
          </NAlert>

          <NForm label-placement="top">
            <NGrid cols="1 l:2" responsive="screen" :x-gap="16" :y-gap="16">
              <NGridItem>
                <NCard title="自动判定" size="small" class="policy-card">
                  <div class="policy-switch-list">
                    <div class="policy-switch-row">
                      <div>
                        <div class="policy-switch-title">启用自动风控</div>
                        <div class="policy-description">
                          检测结果满足阈值时，自动执行预警或封号
                        </div>
                      </div>
                      <NSwitch
                        v-model:value="policy.enabled"
                        :disabled="!canUpdateRisk"
                      />
                    </div>
                    <div class="policy-switch-row">
                      <div>
                        <div class="policy-switch-title">强制近期检测</div>
                        <div class="policy-description">
                          关键操作前要求存在有效期内的风控结果
                        </div>
                      </div>
                      <NSwitch
                        v-model:value="policy.requireFreshAssessment"
                        :disabled="!canUpdateRisk"
                      />
                    </div>
                  </div>
                  <div class="policy-field-grid">
                    <NFormItem label="自动判定最少有效项">
                      <NInputNumber
                        v-model:value="policy.minKnownChecks"
                        :disabled="!canUpdateRisk"
                        :min="1"
                        :max="10"
                      >
                        <template #suffix>项</template>
                      </NInputNumber>
                    </NFormItem>
                    <NFormItem label="自动封号阈值（低于）">
                      <NInputNumber
                        v-model:value="policy.autoBanThreshold"
                        :disabled="!canUpdateRisk"
                        :min="10"
                        :max="100"
                        :step="10"
                      >
                        <template #suffix>分</template>
                      </NInputNumber>
                    </NFormItem>
                    <NFormItem label="预警阈值（低于）">
                      <NInputNumber
                        v-model:value="policy.warningThreshold"
                        :disabled="!canUpdateRisk"
                        :min="10"
                        :max="100"
                        :step="10"
                      >
                        <template #suffix>分</template>
                      </NInputNumber>
                    </NFormItem>
                  </div>
                </NCard>
              </NGridItem>

              <NGridItem>
                <NCard title="附近设备聚集" size="small" class="policy-card">
                  <div class="policy-card-hint">
                    最近 {{ policy.presenceWindowMinutes }} 分钟内，以
                    {{ policy.nearbyRadiusMeters }} 米为半径检测到
                    {{ policy.nearbyDeviceThreshold }} 台及以上活跃设备时判定风险。
                  </div>
                  <div class="policy-field-grid">
                    <NFormItem label="检测半径">
                      <NInputNumber
                        v-model:value="policy.nearbyRadiusMeters"
                        :disabled="!canUpdateRisk"
                        :min="10"
                        :max="5000"
                      >
                        <template #suffix>米</template>
                      </NInputNumber>
                    </NFormItem>
                    <NFormItem label="风险设备阈值">
                      <NInputNumber
                        v-model:value="policy.nearbyDeviceThreshold"
                        :disabled="!canUpdateRisk"
                        :min="2"
                        :max="100"
                      >
                        <template #suffix>台</template>
                      </NInputNumber>
                    </NFormItem>
                    <NFormItem label="设备活跃时间窗口">
                      <NInputNumber
                        v-model:value="policy.presenceWindowMinutes"
                        :disabled="!canUpdateRisk"
                        :min="1"
                        :max="1440"
                      >
                        <template #suffix>分钟</template>
                      </NInputNumber>
                    </NFormItem>
                    <NFormItem label="最大定位误差">
                      <NInputNumber
                        v-model:value="policy.maxLocationAccuracyMeters"
                        :disabled="!canUpdateRisk"
                        :min="5"
                        :max="1000"
                      >
                        <template #suffix>米</template>
                      </NInputNumber>
                    </NFormItem>
                    <NFormItem label="定位最大年龄">
                      <NInputNumber
                        v-model:value="policy.maxLocationAgeSeconds"
                        :disabled="!canUpdateRisk"
                        :min="30"
                        :max="600"
                      >
                        <template #suffix>秒</template>
                      </NInputNumber>
                    </NFormItem>
                    <NFormItem label="位置记录保留时间">
                      <NInputNumber
                        v-model:value="policy.locationRetentionHours"
                        :disabled="!canUpdateRisk"
                        :min="1"
                        :max="168"
                      >
                        <template #suffix>小时</template>
                      </NInputNumber>
                    </NFormItem>
                  </div>
                </NCard>
              </NGridItem>

              <NGridItem>
                <NCard title="检测有效期" size="small" class="policy-card">
                  <div class="policy-card-hint">
                    超过有效期的检测结果不会用于登录、广告和提现等关键操作。
                  </div>
                  <div class="policy-field-grid">
                    <NFormItem label="登录检测有效期">
                      <NInputNumber
                        v-model:value="policy.loginValidityHours"
                        :disabled="!canUpdateRisk"
                        :min="1"
                        :max="168"
                      >
                        <template #suffix>小时</template>
                      </NInputNumber>
                    </NFormItem>
                    <NFormItem label="广告检测有效期">
                      <NInputNumber
                        v-model:value="policy.rewardValidityMinutes"
                        :disabled="!canUpdateRisk"
                        :min="1"
                        :max="1440"
                      >
                        <template #suffix>分钟</template>
                      </NInputNumber>
                    </NFormItem>
                    <NFormItem label="提现检测有效期">
                      <NInputNumber
                        v-model:value="policy.withdrawalValidityMinutes"
                        :disabled="!canUpdateRisk"
                        :min="1"
                        :max="1440"
                      >
                        <template #suffix>分钟</template>
                      </NInputNumber>
                    </NFormItem>
                  </div>
                </NCard>
              </NGridItem>

              <NGridItem>
                <NCard title="关联账号预警" size="small" class="policy-card">
                  <div class="policy-card-hint">
                    同一设备或 IP 关联账号达到阈值时生成风控预警，便于人工复核。
                  </div>
                  <div class="policy-field-grid">
                    <NFormItem label="同设备账号预警数">
                      <NInputNumber
                        v-model:value="policy.multiAccountDeviceThreshold"
                        :disabled="!canUpdateRisk"
                        :min="2"
                        :max="100"
                      >
                        <template #suffix>个</template>
                      </NInputNumber>
                    </NFormItem>
                    <NFormItem label="同 IP 账号预警数">
                      <NInputNumber
                        v-model:value="policy.multiAccountIpThreshold"
                        :disabled="!canUpdateRisk"
                        :min="2"
                        :max="100"
                      >
                        <template #suffix>个</template>
                      </NInputNumber>
                    </NFormItem>
                  </div>
                </NCard>
              </NGridItem>
            </NGrid>

            <div class="policy-actions">
              <div>
                <div class="policy-actions-title">配置变更将在保存后立即生效</div>
                <div class="policy-description">
                  建议调整阈值后持续观察风险事件与误判情况。
                </div>
              </div>
              <NTag v-if="!canUpdateRisk" type="warning">当前账号仅可查看</NTag>
              <NButton
                v-else
                type="primary"
                size="large"
                :loading="savingPolicy"
                @click="savePolicy"
              >
                保存风控策略
              </NButton>
            </div>
          </NForm>
        </NTabPane>
      </NTabs>
</NCard>

    <NModal v-model:show="riskActionVisible" preset="card" :title="riskActionForm.status === 'CONFIRMED' ? '确认风险事件' : '忽略风险事件'" class="action-modal">
      <template v-if="selectedRisk">
        <NAlert :type="riskActionForm.status === 'CONFIRMED' ? 'warning' : 'info'" class="mb-4">
          <div class="action-title">{{ selectedRisk.title }}</div>
          <div class="action-description">规则 {{ selectedRisk.ruleCode }} · {{ selectedRisk.user ? `${selectedRisk.user.nickname} (${selectedRisk.user.phone})` : '未关联用户' }}</div>
        </NAlert>
        <NForm label-placement="top">
          <NFormItem label="处理结论"><NSelect v-model:value="riskActionForm.status" :options="[{label:'确认风险',value:'CONFIRMED'},{label:'忽略误报',value:'IGNORED'}]" /></NFormItem>
          <NFormItem label="处理备注" feedback="至少填写 2 个字，保存后写入审计日志"><NInput v-model:value="riskActionForm.remark" type="textarea" :rows="4" maxlength="500" show-count placeholder="说明确认依据或忽略原因" /></NFormItem>
        </NForm>
        <div class="ticket-actions"><NButton @click="riskActionVisible = false">取消</NButton><NButton type="primary" :loading="riskActionSaving" @click="submitRiskAction">确认提交</NButton></div>
      </template>
    </NModal>

    <NModal v-model:show="userRiskVisible" preset="card" :title="userRiskForm.riskStatus === 'BANNED' ? '主动封禁用户' : '解除用户封禁'" class="action-modal">
      <template v-if="selectedRiskUser">
        <NAlert :type="userRiskForm.riskStatus === 'BANNED' ? 'error' : 'success'" class="mb-4">
          <div class="action-title">{{ selectedRiskUser.nickname }}（{{ selectedRiskUser.phone }}）</div>
          <div class="action-description">{{ userRiskForm.riskStatus === 'BANNED' ? '封禁后账号将停用，当前登录会话会被撤销。' : '解除后账号恢复正常状态，但不会恢复已经撤销的登录会话。' }}</div>
        </NAlert>
        <NForm label-placement="top">
          <NFormItem label="目标状态"><NSelect v-model:value="userRiskForm.riskStatus" :options="[{label:'封禁账号',value:'BANNED'},{label:'恢复正常',value:'NORMAL'}]" /></NFormItem>
          <NFormItem label="操作原因" feedback="该操作需要当前管理员登录密码二次验证"><NInput v-model:value="userRiskForm.riskRemark" type="textarea" :rows="4" maxlength="500" show-count placeholder="填写证据、复核结果或解除原因" /></NFormItem>
        </NForm>
        <div class="ticket-actions"><NButton @click="userRiskVisible = false">取消</NButton><NButton :type="userRiskForm.riskStatus === 'BANNED' ? 'error' : 'primary'" :loading="userRiskSaving" @click="submitUserRisk">继续并验证密码</NButton></div>
      </template>
    </NModal>

    <NModal v-model:show="ticketVisible" preset="card" title="处理反馈工单" class="ticket-modal">
      <template v-if="selectedTicket">
        <NDescriptions bordered label-placement="left" :column="1" class="mb-4">
          <NDescriptionsItem label="提交用户">{{ selectedTicket.user ? `${selectedTicket.user.nickname} (${selectedTicket.user.phone})` : '匿名用户' }}</NDescriptionsItem>
          <NDescriptionsItem label="问题类型">{{ selectedTicket.type }}</NDescriptionsItem>
          <NDescriptionsItem label="问题内容">{{ selectedTicket.content }}</NDescriptionsItem>
          <NDescriptionsItem v-if="selectedTicket.contact" label="联系方式">{{ selectedTicket.contact }}</NDescriptionsItem>
          <NDescriptionsItem label="提交时间">{{ formatDateTime(selectedTicket.createdAt) }}</NDescriptionsItem>
        </NDescriptions>
        <div v-if="selectedTicket.history.length" class="ticket-history">
          <div class="ticket-history-title">处理记录</div>
          <div v-for="item in selectedTicket.history" :key="`${item.status}-${item.createdAt}`" class="ticket-history-row"><NTag size="small" :type="businessStatusType(item.status)">{{ businessStatusText(item.status) }}</NTag><span>{{ formatDateTime(item.createdAt) }}</span></div>
        </div>
        <NForm label-placement="top" :disabled="!canUpdateFeedback">
          <NFormItem label="处理状态"><NSelect v-model:value="ticketForm.status" :options="feedbackStatusOptions" /></NFormItem>
          <NFormItem label="用户可见回复" feedback="该内容会显示在 App 工单详情中，并通过站内信提醒用户"><NInput v-model:value="ticketForm.reply" type="textarea" :rows="4" maxlength="10000" show-count placeholder="说明处理结果或需要用户补充的信息" /></NFormItem>
          <NFormItem label="内部备注" feedback="仅后台人员可见，不会发送给用户"><NInput v-model:value="ticketForm.internalNote" type="textarea" :rows="3" maxlength="10000" show-count placeholder="记录核查过程、交接信息等" /></NFormItem>
        </NForm>
        <div class="ticket-actions"><NButton @click="ticketVisible = false">关闭</NButton><NButton v-if="canUpdateFeedback" type="primary" :loading="ticketSaving" @click="submitTicket">保存处理进度</NButton></div>
      </template>
    </NModal>

    <NModal v-model:show="reportVisible" preset="card" title="处理用户举报" class="ticket-modal">
      <template v-if="selectedReport">
        <NDescriptions bordered label-placement="left" :column="1" class="mb-4">
          <NDescriptionsItem label="提交用户">{{ `${selectedReport.user.nickname} (${selectedReport.user.phone})` }}</NDescriptionsItem>
          <NDescriptionsItem label="举报目标">{{ selectedReport.targetType }}{{ selectedReport.targetId ? ` · ${selectedReport.targetId}` : '' }}</NDescriptionsItem>
          <NDescriptionsItem label="举报内容">{{ selectedReport.content }}</NDescriptionsItem>
          <NDescriptionsItem label="提交时间">{{ formatDateTime(selectedReport.createdAt) }}</NDescriptionsItem>
        </NDescriptions>
        <div v-if="selectedReport.history.length" class="ticket-history">
          <div class="ticket-history-title">处理记录</div>
          <div v-for="item in selectedReport.history" :key="`${item.status}-${item.createdAt}`" class="ticket-history-row"><NTag size="small" :type="businessStatusType(item.status)">{{ businessStatusText(item.status) }}</NTag><span>{{ formatDateTime(item.createdAt) }}</span></div>
        </div>
        <NForm label-placement="top" :disabled="!canUpdateReport">
          <NFormItem label="处理状态"><NSelect v-model:value="reportForm.status" :options="reportStatusOptions" /></NFormItem>
          <NFormItem label="处置结果"><NInput v-model:value="reportForm.disposition" maxlength="100" placeholder="例如：内容下架、核查无违规" /></NFormItem>
          <NFormItem label="用户可见说明" feedback="处理完成后会显示在 App，并通过站内信提醒用户"><NInput v-model:value="reportForm.remark" type="textarea" :rows="4" maxlength="10000" show-count placeholder="说明核查结论及处置结果" /></NFormItem>
        </NForm>
        <div class="ticket-actions"><NButton @click="reportVisible = false">关闭</NButton><NButton v-if="canUpdateReport" type="primary" :loading="reportSaving" @click="submitReport">保存处理进度</NButton></div>
      </template>
    </NModal>

    <NModal
      v-model:show="detailVisible"
      class="risk-detail-modal"
      preset="card"
      :title="`风控检测明细 · ${selectedAssessment?.user.nickname ?? ''}`"
      :content-style="{
        maxHeight: 'calc(100vh - 140px)',
        overflowX: 'hidden',
        overflowY: 'auto',
      }"
    >
      <template v-if="selectedAssessment">
        <NGrid :cols="4" :x-gap="12" class="mb-4">
          <NGridItem>
            <NStatistic label="最终评分" :value="`${selectedAssessment.score} 分`" />
          </NGridItem>
          <NGridItem>
            <NStatistic label="实际扣分" :value="`${100 - selectedAssessment.score} 分`" />
          </NGridItem>
          <NGridItem>
            <NStatistic label="有效检测" :value="`${selectedAssessment.knownChecks}/10`" />
          </NGridItem>
          <NGridItem>
            <NStatistic label="处理结果" :value="selectedAssessment.autoBanned ? '自动封号' : '未自动封号'" />
          </NGridItem>
        </NGrid>
        <NAlert
          :type="selectedAssessment.score < selectedAssessment.policy.autoBanThreshold ? 'error' : selectedAssessment.score < selectedAssessment.policy.warningThreshold ? 'warning' : 'success'"
          class="mb-4"
        >
          <div>
            自动封号条件：有效检测不少于 {{ selectedAssessment.policy.minKnownChecks }} 项，且评分严格低于 {{ selectedAssessment.policy.autoBanThreshold }} 分。
          </div>
          <div v-if="selectedAssessment.enforcementSuppressed" class="mt-1">
            本次已达到封号条件，但开发环境仅记录风险，未实际封号。
          </div>
          <div v-if="selectedAssessment.policySource === 'CURRENT'" class="mt-1">
            该历史记录未保存策略快照，阈值说明使用当前后台策略；逐项结果和实际扣分仍来自原始记录。
          </div>
        </NAlert>
        <NDataTable
          :columns="breakdownColumns"
          :data="selectedAssessment.breakdown"
          :scroll-x="840"
          class="mb-4"
        />
        <NDescriptions label-placement="left" bordered :column="1">
          <NDescriptionsItem label="检测场景">
            {{ selectedAssessment.context === 'reward' ? '观看广告' : selectedAssessment.context === 'withdrawal' ? '提现' : selectedAssessment.context === 'login' ? '登录' : '未记录' }}
          </NDescriptionsItem>
          <NDescriptionsItem label="检测时间">{{ formatDateTime(selectedAssessment.createdAt) }}</NDescriptionsItem>
          <NDescriptionsItem label="设备 ID">{{ selectedAssessment.deviceId }}</NDescriptionsItem>
          <NDescriptionsItem label="服务端 IP">{{ selectedAssessment.ip || '未取得' }}</NDescriptionsItem>
          <NDescriptionsItem label="设备摘要">{{ selectedAssessment.evidence.device || '未记录' }}</NDescriptionsItem>
          <NDescriptionsItem label="Android / ABI">
            SDK {{ selectedAssessment.evidence.sdkInt ?? '未知' }} / {{ selectedAssessment.evidence.supportedAbis || '未知' }}
          </NDescriptionsItem>
          <NDescriptionsItem label="采集器版本">{{ selectedAssessment.evidence.collectorVersion || '未记录' }}</NDescriptionsItem>
          <NDescriptionsItem label="权限状态">
            电话权限：{{ selectedAssessment.evidence.phonePermission === true ? '已授权' : selectedAssessment.evidence.phonePermission === false ? '未授权' : '未知' }}；
            定位权限：{{ selectedAssessment.evidence.locationPermission === true ? '已授权' : selectedAssessment.evidence.locationPermission === false ? '未授权' : '未知' }}
          </NDescriptionsItem>
          <NDescriptionsItem label="附近设备检测">
            {{ selectedAssessment.evidence.nearbyDeviceCount ?? '无法判断' }} 台 / {{ selectedAssessment.evidence.nearbyRadiusMeters ?? selectedAssessment.policy.nearbyRadiusMeters }} 米 / 最近 {{ selectedAssessment.evidence.presenceWindowMinutes ?? selectedAssessment.policy.presenceWindowMinutes }} 分钟
          </NDescriptionsItem>
          <NDescriptionsItem label="定位质量">
            精度 {{ selectedAssessment.evidence.locationAccuracyMeters ?? '未知' }} 米；模拟定位：{{ selectedAssessment.evidence.locationMock === true ? '是' : selectedAssessment.evidence.locationMock === false ? '否' : '未知' }}
          </NDescriptionsItem>
          <NDescriptionsItem label="关联账号">
            同设备 {{ selectedAssessment.evidence.deviceAccountCount ?? '未记录' }} 个；同 IP {{ selectedAssessment.evidence.ipAccountCount ?? '未记录' }} 个
          </NDescriptionsItem>
        </NDescriptions>
      </template>
    </NModal>
  </Page>
</template>

<style scoped>
.ticket-modal {
  width: min(720px, calc(100vw - 32px));
}

.action-modal {
  width: min(560px, calc(100vw - 32px));
}

.action-title {
  font-weight: 600;
}

.action-description {
  margin-top: 6px;
  opacity: 0.72;
}

.table-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
  color: rgba(255, 255, 255, 50%);
  font-size: 13px;
}

.table-toolbar :deep(.n-select) {
  width: 220px;
}

.table-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.ticket-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.ticket-history {
  margin-bottom: 16px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 8%);
  border-radius: 8px;
}

.ticket-history-title {
  margin-bottom: 10px;
  font-weight: 600;
}

.ticket-history-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  color: rgba(255, 255, 255, 55%);
  font-size: 12px;
}

.policy-card {
  height: 100%;
}

.policy-switch-list {
  display: grid;
  gap: 10px;
  margin-bottom: 18px;
}

.policy-switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 66px;
  padding: 11px 14px;
  border: 1px solid rgba(255, 255, 255, 8%);
  border-radius: 8px;
  background: rgba(255, 255, 255, 2.5%);
}

.policy-switch-title,
.policy-actions-title {
  font-weight: 600;
}

.policy-description {
  margin-top: 4px;
  color: rgba(255, 255, 255, 45%);
  font-size: 12px;
  line-height: 1.5;
}

.policy-card-hint {
  min-height: 42px;
  margin-bottom: 16px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(24, 160, 88, 8%);
  color: rgba(255, 255, 255, 58%);
  font-size: 12px;
  line-height: 1.7;
}

.policy-field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 16px;
}

.policy-field-grid :deep(.n-input-number) {
  width: 100%;
}

.policy-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-top: 16px;
  padding: 16px 18px;
  border: 1px solid rgba(255, 255, 255, 8%);
  border-radius: 8px;
  background: rgba(255, 255, 255, 2.5%);
}

@media (max-width: 720px) {
  .policy-field-grid {
    grid-template-columns: 1fr;
  }

  .policy-actions {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
