import React, {useEffect, useState} from 'react';
import {KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {AppIcon, AppIconName} from '../../components/AppIcon';
import {BrandMark} from '../../components/BrandMark';
import {AppButton, AppCard} from '../../components/DesignSystem';
import {Screen} from '../../components/Screen';
import {useAuthStore} from '../../stores/auth';
import {appApi} from '../../api/app';
import {colors, radii, spacing, typography} from '../../theme';
import {brandConfig} from '../../config/brand';
import {productModules} from '../../config/modules';

function AuthInput({icon, placeholder, value, onChangeText, secure, keyboardType, autoCapitalize}: {icon: AppIconName; placeholder: string; value: string; onChangeText: (value: string) => void; secure?: boolean; keyboardType?: 'default' | 'phone-pad'; autoCapitalize?: 'none' | 'characters'}) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.inputWrap}>
      <AppIcon name={icon} color={colors.muted} size={18} />
      <TextInput style={styles.input} placeholder={placeholder} placeholderTextColor={colors.subtle} value={value} onChangeText={onChangeText} secureTextEntry={secure && !visible} keyboardType={keyboardType} autoCapitalize={autoCapitalize ?? 'none'} />
      {secure ? <Pressable hitSlop={10} onPress={() => setVisible(current => !current)}><AppIcon name={visible ? 'eye-off' : 'eye'} color={colors.muted} size={19} /></Pressable> : null}
    </View>
  );
}

export function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [smsBusy, setSmsBusy] = useState(false);
  const [smsCountdown, setSmsCountdown] = useState(0);
  const [error, setError] = useState('');
  const login = useAuthStore(state => state.login);
  const register = useAuthStore(state => state.register);

  useEffect(() => {
    if (smsCountdown <= 0) return;
    const timer = setTimeout(() => setSmsCountdown(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [smsCountdown]);

  const switchMode = (next: 'login' | 'register') => { setMode(next); setError(''); };
  const sendSmsCode = async () => {
    setError('');
    if (!/^1\d{10}$/.test(phone)) return setError('请输入正确的 11 位手机号');
    if (smsBusy || smsCountdown > 0) return;
    setSmsBusy(true);
    try {
      const result = await appApi.sendRegistrationSms(phone);
      setSmsCountdown(result.resendAfter || 60);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '验证码发送失败，请稍后重试');
    } finally {
      setSmsBusy(false);
    }
  };
  const submit = async () => {
    setError('');
    if (!/^1\d{10}$/.test(phone)) return setError('请输入正确的 11 位手机号');
    if (password.length < (mode === 'register' ? 8 : 6)) return setError(mode === 'register' ? '注册密码至少需要 8 位' : '密码至少需要 6 位');
    if (mode === 'register' && !/^\d{6}$/.test(smsCode)) return setError('请输入 6 位短信验证码');
    if (mode === 'register' && !nickname.trim()) return setError('请输入昵称');
    if (mode === 'register' && productModules.invitations && !/^[A-Za-z0-9]{6,12}$/.test(inviteCode)) return setError('请输入 6–12 位字母或数字邀请码');
    if (!agreed) return setError('请先阅读并同意用户协议与隐私政策');
    setBusy(true);
    try {
      if (mode === 'login') await login(phone, password);
      else await register({phone, smsCode, password, nickname: nickname.trim(), inviteCode: productModules.invitations ? inviteCode.toUpperCase() : undefined});
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '请求失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={styles.brandArea}>
            <BrandMark size={68} style={styles.logo} />
            <Text style={styles.brand}>{brandConfig.name}</Text>
            <Text style={styles.caption}>每一次滑动，都有值得停留的故事</Text>
          </View>
          <AppCard style={styles.formCard} elevated>
            <View style={styles.tabs}>
              {(productModules.smsRegistration ? ['login', 'register'] as const : ['login'] as const).map(item => <Pressable key={item} onPress={() => switchMode(item)} style={styles.tab}><Text style={[styles.tabText, mode === item && styles.tabTextActive]}>{item === 'login' ? '登录' : '注册'}</Text>{mode === item ? <View style={styles.tabIndicator} /> : null}</Pressable>)}
            </View>
            <View style={styles.fields}>
              <AuthInput icon="phone" placeholder="手机号" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
              {mode === 'register' ? <View style={styles.smsRow}>
                <View style={styles.smsInput}><AuthInput icon="shield" placeholder="6 位验证码" keyboardType="phone-pad" value={smsCode} onChangeText={value => setSmsCode(value.replace(/\D/g, '').slice(0, 6))} /></View>
                <Pressable disabled={smsBusy || smsCountdown > 0} onPress={sendSmsCode} style={({pressed}) => [styles.smsButton, (smsBusy || smsCountdown > 0) && styles.smsButtonDisabled, pressed && styles.smsButtonPressed]}>
                  <Text style={styles.smsButtonText}>{smsBusy ? '发送中' : smsCountdown > 0 ? `${smsCountdown}s` : '获取验证码'}</Text>
                </Pressable>
              </View> : null}
              <AuthInput icon="lock" placeholder={mode === 'register' ? '密码（至少 8 位）' : '密码'} secure value={password} onChangeText={setPassword} />
              {mode === 'register' ? <><AuthInput icon="user" placeholder="昵称" value={nickname} onChangeText={setNickname} />{productModules.invitations ? <AuthInput icon="user-plus" placeholder="邀请码（必填）" value={inviteCode} onChangeText={setInviteCode} autoCapitalize="characters" /> : null}</> : null}
            </View>
            {error ? <View style={styles.errorBox}><AppIcon name="info" color={colors.danger} size={16} /><Text style={styles.errorText}>{error}</Text></View> : null}
            <Pressable onPress={() => setAgreed(value => !value)} style={styles.agreement}>
              <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>{agreed ? <AppIcon name="check" color="#1B1609" size={12} strokeWidth={3} /> : null}</View>
              <Text style={styles.agreementText}>我已阅读并同意 <Text style={styles.link}>《用户协议》</Text> 和 <Text style={styles.link}>《隐私政策》</Text></Text>
            </Pressable>
            <AppButton title={mode === 'login' ? '登录' : '注册并登录'} loading={busy} onPress={submit} style={styles.submit} />
            <Text style={styles.securityTip}>登录后才可访问内容，账号数据将被安全保护</Text>
          </AppCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1}, content: {flexGrow: 1, justifyContent: 'center', paddingVertical: spacing.xxl}, brandArea: {alignItems: 'center', marginBottom: spacing.xxl}, logo: {shadowColor: colors.primary, shadowOpacity: 0.22, shadowRadius: 18, elevation: 5}, brand: {color: colors.text, ...typography.display, marginTop: spacing.lg}, caption: {color: colors.muted, ...typography.body, marginTop: spacing.xs},
  formCard: {borderRadius: radii.xl, padding: spacing.xl}, tabs: {height: 44, flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.divider, marginBottom: spacing.xl}, tab: {flex: 1, alignItems: 'center'}, tabText: {color: colors.muted, fontSize: 16, lineHeight: 24, fontWeight: '600'}, tabTextActive: {color: colors.text}, tabIndicator: {position: 'absolute', bottom: -1, width: 40, height: 3, borderRadius: 2, backgroundColor: colors.primary}, fields: {gap: spacing.md},
  inputWrap: {height: 52, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md}, input: {flex: 1, color: colors.text, ...typography.body, paddingVertical: 0}, errorBox: {minHeight: 40, marginTop: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.sm, backgroundColor: colors.dangerSoft, flexDirection: 'row', alignItems: 'center', gap: spacing.sm}, errorText: {color: colors.danger, ...typography.caption, flex: 1}, agreement: {flexDirection: 'row', alignItems: 'flex-start', marginTop: spacing.lg}, checkbox: {width: 19, height: 19, borderRadius: 6, borderWidth: 1, borderColor: colors.muted, alignItems: 'center', justifyContent: 'center', marginTop: 1}, checkboxChecked: {backgroundColor: colors.primary, borderColor: colors.primary}, agreementText: {color: colors.muted, ...typography.caption, flex: 1, marginLeft: spacing.sm}, link: {color: colors.primary}, submit: {marginTop: spacing.xl}, securityTip: {color: colors.subtle, ...typography.caption, textAlign: 'center', marginTop: spacing.lg},
  smsRow: {flexDirection: 'row', gap: spacing.sm}, smsInput: {flex: 1}, smsButton: {width: 108, height: 52, borderRadius: radii.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center'}, smsButtonDisabled: {opacity: 0.55}, smsButtonPressed: {opacity: 0.8}, smsButtonText: {color: '#1B1609', fontSize: 14, fontWeight: '700'},
});
