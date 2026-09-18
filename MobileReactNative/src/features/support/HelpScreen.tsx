import React, {useCallback, useState} from 'react';
import {KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {appApi} from '../../api/app';
import {AppButton, AppCard, EmptyState, SectionHeader, SkeletonBlock} from '../../components/DesignSystem';
import {Field} from '../../components/FormControls';
import {Screen} from '../../components/Screen';
import {useAppToast} from '../../components/AppToast';
import {colors, radii, spacing, typography} from '../../theme';
import type {Feedback, UserReport} from '../../types/api';

type Mode = 'feedback' | 'report';
type Ticket = Feedback | UserReport;
const faqs = [
  ['金币如何获得？', '完成签到、广告和活动任务后，金币会记入账户。'],
  ['为什么无法提现？', '请先绑定收款账户，并确认余额和提现条件满足后台配置。'],
  ['广告奖励没到账？', '请勿中途退出视频；仍未到账时可在下方提交反馈。'],
];
const statusText: Record<string, string> = {PENDING: '等待受理', PROCESSING: '处理中', RESOLVED: '已解决', CLOSED: '已关闭', VALID: '举报有效', INVALID: '举报无效'};
const terminalStatuses = new Set(['RESOLVED', 'CLOSED', 'VALID', 'INVALID']);

export function HelpScreen() {
  const toast = useAppToast();
  const [mode, setMode] = useState<Mode>('feedback');
  const [type, setType] = useState('功能问题');
  const [targetType, setTargetType] = useState('内容');
  const [targetId, setTargetId] = useState('');
  const [content, setContent] = useState('');
  const [contact, setContact] = useState('');
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [reports, setReports] = useState<UserReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [feedbackList, reportList] = await Promise.all([appApi.feedback(), appApi.reports()]);
      setFeedback(feedbackList);
      setReports(reportList);
    } catch (error) {
      toast.show(error instanceof Error ? error.message : '工单加载失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);
  useFocusEffect(useCallback(() => { load().catch(() => undefined); }, [load]));

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const submit = async () => {
    if (content.trim().length < 2) return toast.show('请详细描述遇到的问题', 'info');
    setSubmitting(true);
    try {
      if (mode === 'feedback') {
        await appApi.submitFeedback({type, content: content.trim(), ...(contact.trim() ? {contact: contact.trim()} : {})});
      } else {
        await appApi.submitReport({type, targetType, ...(targetId.trim() ? {targetId: targetId.trim()} : {}), content: content.trim()});
      }
      setContent('');
      setTargetId('');
      await load();
      toast.show(mode === 'feedback' ? '反馈已提交，我们会尽快处理' : '举报已提交，请留意处理进度', 'success');
    } catch (error) {
      toast.show(error instanceof Error ? error.message : '提交失败，请稍后重试', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const list: Ticket[] = mode === 'feedback' ? feedback : reports;
  return <Screen><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={styles.content} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}>
    <SectionHeader title="帮助与服务" description="查询常见问题，提交反馈或举报并跟踪处理进度" />
    <View style={styles.faqList}>{faqs.map(item => <AppCard key={item[0]} style={styles.faqCard}><Text style={styles.cardTitle}>{item[0]}</Text><Text style={styles.bodyText}>{item[1]}</Text></AppCard>)}</View>
    <View style={styles.segment}>{(['feedback', 'report'] as Mode[]).map(item => <Pressable key={item} onPress={() => setMode(item)} style={[styles.segmentItem, mode === item && styles.segmentActive]}><Text style={[styles.segmentText, mode === item && styles.segmentTextActive]}>{item === 'feedback' ? '问题反馈' : '内容举报'}</Text></Pressable>)}</View>
    <AppCard style={styles.formCard}>
      <Text style={styles.formTitle}>{mode === 'feedback' ? '告诉我们遇到的问题' : '提交违规内容线索'}</Text>
      <Text style={styles.formHint}>{mode === 'feedback' ? '提交后可在下方查看受理状态和官方回复' : '平台会核实举报信息，并将判定结果通知给你'}</Text>
      <Text style={styles.label}>{mode === 'feedback' ? '问题类型' : '举报类型'}</Text><Field value={type} onChangeText={setType} placeholder={mode === 'feedback' ? '例如：功能问题' : '例如：违规内容'} />
      {mode === 'report' ? <><Text style={styles.label}>举报目标</Text><Field value={targetType} onChangeText={setTargetType} placeholder="例如：内容、广告" /><Field value={targetId} onChangeText={setTargetId} placeholder="内容 ID（选填）" /></> : null}
      <Text style={styles.label}>详细说明</Text><Field multiline value={content} maxLength={10000} onChangeText={setContent} placeholder="请说明发生时间、操作步骤和具体表现" />
      {mode === 'feedback' ? <Field value={contact} maxLength={100} onChangeText={setContact} placeholder="联系方式（选填）" /> : null}
      <AppButton title={mode === 'feedback' ? '提交反馈' : '提交举报'} icon="check" loading={submitting} onPress={() => submit().catch(() => undefined)} />
    </AppCard>
    <View style={styles.ticketSection}>
      <SectionHeader title={mode === 'feedback' ? '我的反馈' : '我的举报'} description="处理进度变化后会通过站内信提醒" />
      {loading ? <View style={styles.ticketList}><SkeletonBlock style={styles.skeleton} /><SkeletonBlock style={styles.skeleton} /></View> : !list.length ? <EmptyState icon="info" title={mode === 'feedback' ? '暂无反馈记录' : '暂无举报记录'} description="提交后可在这里持续查看处理状态" /> : <View style={styles.ticketList}>{list.map(ticket => <TicketCard key={ticket.id} ticket={ticket} />)}</View>}
    </View>
  </ScrollView></KeyboardAvoidingView></Screen>;
}

function TicketCard({ticket}: {ticket: Ticket}) {
  const report = 'targetType' in ticket;
  const response = report ? ticket.remark : ticket.reply;
  const history = ticket.history?.filter((item, index, items) => index === 0 || item.status !== items[index - 1]?.status) ?? [];
  return <AppCard style={styles.ticketCard}>
    <View style={styles.ticketHeader}><View style={styles.ticketHeading}><Text style={styles.cardTitle}>{ticket.type}</Text><Text style={styles.ticketId}>#{ticket.id}</Text></View><View style={[styles.badge, terminalStatuses.has(ticket.status) && styles.badgeDone]}><Text style={[styles.badgeText, terminalStatuses.has(ticket.status) && styles.badgeTextDone]}>{statusText[ticket.status] ?? ticket.status}</Text></View></View>
    {report ? <Text style={styles.meta}>举报目标：{ticket.targetType}{ticket.targetId ? ` · ${ticket.targetId}` : ''}</Text> : null}
    <Text style={styles.bodyText}>{ticket.content}</Text>
    {response ? <View style={styles.response}><Text style={styles.responseLabel}>平台回复</Text><Text style={styles.responseText}>{response}</Text></View> : null}
    <View style={styles.timeline}>{history.map((item, index) => <View key={`${item.status}-${item.createdAt}-${index}`} style={styles.timelineRow}><View style={[styles.timelineDot, index === history.length - 1 && styles.timelineDotActive]} /><View><Text style={styles.timelineStatus}>{statusText[item.status] ?? item.status}</Text><Text style={styles.timelineTime}>{new Date(item.createdAt).toLocaleString('zh-CN', {hour12: false})}</Text></View></View>)}</View>
  </AppCard>;
}

const styles = StyleSheet.create({
  flex: {flex: 1}, content: {paddingBottom: 96}, faqList: {gap: spacing.sm, marginTop: spacing.lg}, faqCard: {padding: spacing.lg}, cardTitle: {color: colors.text, ...typography.body, fontWeight: '700'}, bodyText: {color: colors.muted, ...typography.body, marginTop: spacing.xs},
  segment: {flexDirection: 'row', padding: 4, marginTop: spacing.xl, borderRadius: radii.md, backgroundColor: colors.surface}, segmentItem: {flex: 1, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radii.sm}, segmentActive: {backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primary}, segmentText: {color: colors.muted, ...typography.label}, segmentTextActive: {color: colors.primary},
  formCard: {marginTop: spacing.md, padding: spacing.lg}, formTitle: {color: colors.text, ...typography.section}, formHint: {color: colors.muted, ...typography.caption, marginTop: spacing.xs, marginBottom: spacing.md}, label: {color: colors.text, ...typography.label, marginBottom: spacing.sm, marginTop: spacing.xs},
  ticketSection: {marginTop: spacing.xl}, ticketList: {gap: spacing.md, marginTop: spacing.md}, skeleton: {height: 170}, ticketCard: {padding: spacing.lg}, ticketHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}, ticketHeading: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1}, ticketId: {color: colors.subtle, ...typography.caption}, meta: {color: colors.primary, ...typography.caption, marginTop: spacing.sm}, badge: {paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: colors.primarySoft}, badgeDone: {backgroundColor: colors.successSoft}, badgeText: {color: colors.primary, ...typography.caption, fontWeight: '600'}, badgeTextDone: {color: colors.success}, response: {marginTop: spacing.md, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.surfaceAlt}, responseLabel: {color: colors.primary, ...typography.label}, responseText: {color: colors.text, ...typography.body, marginTop: spacing.xs},
  timeline: {marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider, gap: spacing.md}, timelineRow: {flexDirection: 'row', gap: spacing.sm}, timelineDot: {width: 8, height: 8, borderRadius: 4, backgroundColor: colors.subtle, marginTop: 5}, timelineDotActive: {backgroundColor: colors.primary}, timelineStatus: {color: colors.text, ...typography.label}, timelineTime: {color: colors.subtle, ...typography.caption, marginTop: 2},
});
