import React, {useCallback, useEffect, useState} from 'react';
import {Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import {useNavigation} from '@react-navigation/native';
import {appApi} from '../../api/app';
import {AppIcon} from '../../components/AppIcon';
import {AppButton, AppCard, AppListRow, EmptyState, SkeletonBlock} from '../../components/DesignSystem';
import {Screen} from '../../components/Screen';
import {colors, radii, spacing, typography} from '../../theme';
import {useAppToast} from '../../components/AppToast';
import {brandConfig} from '../../config/brand';
import {appConfig} from '../../config/app-config';

export function ShareScreen() {
  const navigation = useNavigation<any>();
  const toast = useAppToast();
  const [data, setData] = useState<any>();
  const [code, setCode] = useState('');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const result = await appApi.inviteInfo();
      setData(result); setCode(result.inviteCode || '');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '邀请信息加载失败');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load().catch(() => undefined); }, [load]);

  const save = async () => {
    const normalized = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{6,12}$/.test(normalized)) return toast.show('邀请码需为 6–12 位字母或数字', 'error');
    setSaving(true);
    try {
      const result = await appApi.updateInviteCode(normalized);
      setData((current: any) => ({...current, ...result, inviteCode: normalized}));
      setCode(normalized); setEditing(false);
      toast.show('新的邀请码已生效', 'success');
    } catch (requestError) {
      toast.show(requestError instanceof Error ? requestError.message : '保存失败，请稍后重试', 'error');
    } finally { setSaving(false); }
  };

  const activeCode = data?.inviteCode || code || '--';
  const inviteUrl = `${appConfig.apiOrigin}/download?code=${encodeURIComponent(activeCode)}`;
  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}><Text style={styles.title}>邀请好友</Text><Text style={styles.subtitle}>分享快乐，也分享每一份收益</Text></View>
        {loading ? <SkeletonBlock style={styles.skeleton} /> : error ? <EmptyState title="邀请信息加载失败" description={error} action="重新加载" onAction={load} icon="user-plus" /> : <>
          <AppCard style={styles.heroCard} elevated>
            <View style={styles.giftCircle}><AppIcon name="gift" color={colors.primary} size={32} /></View>
            <Text style={styles.heroLabel}>我的邀请码</Text>
            <Text style={styles.code}>{activeCode}</Text>
            <Text style={styles.tip}>好友注册时必须填写此邀请码</Text>
            <View style={styles.qrCard}>
              <QRCode value={inviteUrl} size={156} color="#141820" backgroundColor="#FFFFFF" />
            </View>
            <Text style={styles.qrTip}>扫码打开最新版下载页并查看邀请码</Text>
            <View style={styles.stats}><View style={styles.stat}><Text style={styles.statValue}>{data?.invitedCount ?? 0}</Text><Text style={styles.statLabel}>已邀请好友</Text></View><View style={styles.statDivider} /><View style={styles.stat}><Text style={styles.statValue}>{data?.inviteRewards?.INVITE_DIRECT?.enabled ? `+${data.inviteRewards.INVITE_DIRECT.amount}` : '持续'}</Text><Text style={styles.statLabel}>{data?.inviteRewards?.INVITE_DIRECT?.enabled ? '直接邀请金币' : '好友收益返佣'}</Text></View></View>
          </AppCard>

          {editing ? <AppCard style={styles.editCard}><Text style={styles.editTitle}>修改邀请码</Text><Text style={styles.editDescription}>支持 6–12 位字母或数字，保存后立即生效</Text><View style={styles.inputWrap}><AppIcon name="edit" color={colors.muted} size={18} /><TextInput style={styles.input} value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="输入新邀请码" placeholderTextColor={colors.subtle} /></View><View style={styles.editActions}><AppButton title="取消" variant="secondary" onPress={() => {setCode(activeCode); setEditing(false);}} style={styles.editButton} /><AppButton title="保存" loading={saving} onPress={save} style={styles.editButton} /></View></AppCard> : <Pressable onPress={() => setEditing(true)} style={({pressed}) => [styles.editEntry, pressed && styles.pressed]}><AppIcon name="edit" color={colors.primary} size={17} /><Text style={styles.editEntryText}>修改我的邀请码</Text></Pressable>}

          <AppButton title="分享给好友" icon="share" onPress={() => Share.share({message: `加入${brandConfig.name}，体验精彩内容。\n我的邀请码：${activeCode}\n下载地址：${inviteUrl}`})} style={styles.shareButton} />
          <AppCard style={styles.relationCard}>
            <AppListRow
              icon="users"
              title="我的邀请关系"
              subtitle="查看上级、直推和间推账号与手机号"
              onPress={() => navigation.navigate('InviteRelations')}
            />
          </AppCard>
          <View style={styles.steps}><Text style={styles.stepsTitle}>邀请流程</Text>{['分享邀请码给好友', '好友下载并完成注册', '好友产生有效收益后获得返佣'].map((item, index) => <View key={item} style={styles.step}><View style={styles.stepNumber}><Text style={styles.stepNumberText}>{index + 1}</Text></View><Text style={styles.stepText}>{item}</Text>{index < 2 ? <View style={styles.stepLine} /> : null}</View>)}</View>
        </>}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {paddingBottom: spacing.xxl}, header: {paddingTop: spacing.lg, paddingBottom: spacing.xl}, title: {color: colors.text, ...typography.title}, subtitle: {color: colors.muted, ...typography.body, marginTop: spacing.xs}, skeleton: {height: 280}, heroCard: {borderRadius: radii.xl, backgroundColor: colors.primarySoft, borderColor: '#4A3C1B', alignItems: 'center', paddingVertical: spacing.xl}, giftCircle: {width: 62, height: 62, borderRadius: 22, backgroundColor: 'rgba(231,184,74,0.12)', alignItems: 'center', justifyContent: 'center'}, heroLabel: {color: '#C8BA8C', ...typography.label, marginTop: spacing.lg}, code: {color: colors.primary, fontSize: 38, lineHeight: 48, fontWeight: '800', letterSpacing: 3, marginTop: spacing.xs}, tip: {color: colors.muted, ...typography.caption, marginTop: spacing.xs}, qrCard: {marginTop: spacing.lg, padding: spacing.md, borderRadius: radii.lg, backgroundColor: '#FFFFFF'}, qrTip: {color: colors.muted, ...typography.caption, marginTop: spacing.sm}, stats: {width: '100%', flexDirection: 'row', marginTop: spacing.xl, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: 'rgba(231,184,74,0.15)'}, stat: {flex: 1, alignItems: 'center'}, statValue: {color: colors.text, fontSize: 17, lineHeight: 23, fontWeight: '700'}, statLabel: {color: colors.muted, ...typography.caption, marginTop: spacing.xs}, statDivider: {width: 1, height: 34, backgroundColor: 'rgba(231,184,74,0.15)'}, editEntry: {height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.md}, editEntryText: {color: colors.primary, ...typography.label}, editCard: {marginTop: spacing.md, gap: spacing.md}, editTitle: {color: colors.text, ...typography.section}, editDescription: {color: colors.muted, ...typography.caption}, inputWrap: {height: 50, borderRadius: radii.md, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm}, input: {flex: 1, color: colors.text, ...typography.body, paddingVertical: 0}, editActions: {flexDirection: 'row', gap: spacing.md}, editButton: {flex: 1}, shareButton: {marginTop: spacing.md}, relationCard: {marginTop: spacing.md, paddingVertical: spacing.xs}, steps: {marginTop: spacing.xl}, stepsTitle: {color: colors.text, ...typography.section, marginBottom: spacing.lg}, step: {minHeight: 48, flexDirection: 'row', alignItems: 'flex-start'}, stepNumber: {width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center'}, stepNumberText: {color: colors.primary, ...typography.label}, stepText: {color: colors.muted, ...typography.body, marginLeft: spacing.md, marginTop: 3}, stepLine: {position: 'absolute', left: 13, top: 31, width: 1, height: 17, backgroundColor: colors.border}, pressed: {opacity: 0.68, transform: [{scale: 0.985}]},
});
