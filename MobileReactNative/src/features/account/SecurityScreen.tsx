import React, {useEffect, useState} from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import {appApi} from '../../api/app';
import {AppIcon} from '../../components/AppIcon';
import {AppButton, AppCard} from '../../components/DesignSystem';
import {Field} from '../../components/FormControls';
import {Screen} from '../../components/Screen';
import {colors, spacing, typography} from '../../theme';
import {useAppDialog} from '../../components/AppDialog';
import {productModules} from '../../config/modules';

export function SecurityScreen() {
  const dialog = useAppDialog();
  const [oldPassword, setOld] = useState('');
  const [newPassword, setNew] = useState('');
  const [name, setName] = useState('');
  const [account, setAccount] = useState('');
  const [maskedAccount, setMaskedAccount] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [accountBusy, setAccountBusy] = useState(false);

  useEffect(() => {
    if (!productModules.withdrawals) return;
    appApi.payoutAccount().then((result: any) => setMaskedAccount(result?.accountMasked ?? '')).catch(() => undefined);
  }, []);

  const changePassword = async () => {
    if (!oldPassword || newPassword.length < 8) return dialog.alert({title: '请检查密码', message: '请输入旧密码，新密码至少需要 8 位', tone: 'warning'});
    setPasswordBusy(true);
    try {
      await appApi.changePassword(oldPassword, newPassword); setOld(''); setNew('');
      await dialog.alert({title: '修改成功', message: '新密码已生效，请妥善保管', tone: 'success'});
    } catch (requestError) {
      await dialog.alert({title: '修改失败', message: requestError instanceof Error ? requestError.message : '请稍后重试', tone: 'danger'});
    } finally { setPasswordBusy(false); }
  };

  const bind = async () => {
    if (!name.trim() || !account.trim()) return dialog.alert({title: '请检查信息', message: '请填写完整的支付宝实名信息', tone: 'warning'});
    setAccountBusy(true);
    try {
      const result = await appApi.bindPayoutAccount(name.trim(), account.trim());
      setMaskedAccount(result?.accountMasked ?? account.replace(/^(.{3}).*(.{4})$/, '$1****$2')); setName(''); setAccount('');
      await dialog.alert({title: '保存成功', message: '支付宝收款账户已绑定', tone: 'success'});
    } catch (requestError) {
      await dialog.alert({title: '绑定失败', message: requestError instanceof Error ? requestError.message : '请稍后重试', tone: 'danger'});
    } finally { setAccountBusy(false); }
  };

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.notice}><View style={styles.noticeIcon}><AppIcon name="shield" color={colors.success} size={24} /></View><View style={styles.noticeBody}><Text style={styles.noticeTitle}>账户安全保护中</Text><Text style={styles.noticeText}>{productModules.withdrawals ? '密码与收款资料均通过安全接口传输' : '密码通过安全接口传输'}</Text></View></View>
        <Text style={styles.sectionTitle}>登录密码</Text>
        <AppCard><Text style={styles.description}>定期更换密码可以降低账户风险</Text><Text style={styles.label}>当前密码</Text><Field secureTextEntry placeholder="输入当前密码" value={oldPassword} onChangeText={setOld} /><Text style={styles.label}>新密码</Text><Field secureTextEntry placeholder="至少 8 位，建议包含数字和字母" value={newPassword} onChangeText={setNew} /><AppButton title="修改密码" icon="lock" variant="secondary" loading={passwordBusy} onPress={changePassword} /></AppCard>
        {productModules.withdrawals ? <><Text style={styles.sectionTitle}>支付宝收款账户</Text>
        <AppCard><View style={styles.accountStatus}><View><Text style={styles.description}>提现前需要完成实名收款账户绑定</Text>{maskedAccount ? <Text style={styles.bound}>当前已绑定 {maskedAccount}</Text> : null}</View><AppIcon name={maskedAccount ? 'check' : 'info'} color={maskedAccount ? colors.success : colors.muted} size={20} /></View><Text style={styles.label}>实名姓名</Text><Field placeholder="请输入支付宝实名姓名" value={name} onChangeText={setName} /><Text style={styles.label}>支付宝账号</Text><Field placeholder="手机号或邮箱账号" value={account} onChangeText={setAccount} autoCapitalize="none" /><AppButton title={maskedAccount ? '更换收款账户' : '绑定收款账户'} icon="wallet" loading={accountBusy} onPress={bind} /></AppCard></> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {paddingTop: spacing.lg, paddingBottom: spacing.xxl}, notice: {minHeight: 76, borderRadius: 16, backgroundColor: colors.successSoft, borderWidth: 1, borderColor: '#20463C', padding: spacing.lg, flexDirection: 'row', alignItems: 'center'}, noticeIcon: {width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(52,200,146,0.1)', alignItems: 'center', justifyContent: 'center'}, noticeBody: {flex: 1, marginLeft: spacing.md}, noticeTitle: {color: colors.text, ...typography.body, fontWeight: '600'}, noticeText: {color: colors.muted, ...typography.caption, marginTop: 2}, sectionTitle: {color: colors.text, ...typography.section, marginTop: spacing.xl, marginBottom: spacing.md}, description: {color: colors.muted, ...typography.caption}, label: {color: colors.text, ...typography.label, marginTop: spacing.lg, marginBottom: spacing.sm}, accountStatus: {flexDirection: 'row', justifyContent: 'space-between'}, bound: {color: colors.success, ...typography.caption, marginTop: spacing.xs},
});
