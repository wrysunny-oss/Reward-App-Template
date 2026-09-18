import React, {useState} from 'react';
import {Image, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {launchImageLibrary} from 'react-native-image-picker';
import {appApi} from '../../api/app';
import {AppIcon} from '../../components/AppIcon';
import {AppButton, AppCard} from '../../components/DesignSystem';
import {Field} from '../../components/FormControls';
import {Screen} from '../../components/Screen';
import {useAuthStore} from '../../stores/auth';
import {colors, radii, spacing, typography} from '../../theme';
import {useAppDialog} from '../../components/AppDialog';

export function ProfileEditScreen() {
  const dialog = useAppDialog();
  const user = useAuthStore(state => state.user)!;
  const setUser = useAuthStore(state => state.setUser);
  const [nickname, setNickname] = useState(user.nickname);
  const [gender, setGender] = useState(user.gender ?? 'unknown');
  const [birthday, setBirthday] = useState(user.birthday ?? '');
  const [bio, setBio] = useState(user.bio ?? '');
  const [avatar, setAvatar] = useState(user.avatarUrl ?? '');
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const chooseAvatar = async () => {
    const result = await launchImageLibrary({mediaType: 'photo', selectionLimit: 1, maxWidth: 1080, maxHeight: 1080, quality: 0.8});
    if (result.didCancel) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return dialog.alert({title: '选择失败', message: result.errorMessage ?? '无法读取图片', tone: 'danger'});
    const body = new FormData();
    body.append('file', {uri: asset.uri, type: asset.type ?? 'image/jpeg', name: asset.fileName ?? `avatar-${Date.now()}.jpg`} as any);
    setBusy(true);
    try {
      const uploaded = await appApi.uploadAvatar(body);
      setAvatarFailed(false); setAvatar(uploaded.avatarUrl); setUser({...user, avatarUrl: uploaded.avatarUrl});
      await dialog.alert({title: '头像已更新', message: '新的头像已保存', tone: 'success'});
    } catch (requestError) {
      await dialog.alert({title: '上传失败', message: requestError instanceof Error ? requestError.message : '请稍后重试', tone: 'danger'});
    } finally { setBusy(false); }
  };

  const save = async () => {
    if (!nickname.trim()) return dialog.alert({title: '请检查资料', message: '昵称不能为空', tone: 'warning'});
    setBusy(true);
    try {
      const next = await appApi.updateProfile({nickname: nickname.trim(), gender, birthday, bio});
      setUser({...user, ...next, avatarUrl: avatar || next.avatarUrl});
      await dialog.alert({title: '保存成功', message: '个人资料已经更新', tone: 'success'});
    } catch (requestError) {
      await dialog.alert({title: '保存失败', message: requestError instanceof Error ? requestError.message : '请稍后重试', tone: 'danger'});
    } finally { setBusy(false); }
  };

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.avatarSection}>
          <Pressable onPress={chooseAvatar} disabled={busy} style={({pressed}) => pressed && styles.pressed}>
            {avatar && !avatarFailed ? <Image source={{uri: avatar}} style={styles.avatar} onError={() => setAvatarFailed(true)} /> : <View style={styles.avatarFallback}><Text style={styles.avatarText}>{nickname.slice(0, 1) || '幻'}</Text></View>}
            <View style={styles.cameraBadge}><AppIcon name="edit" color="#1B1609" size={14} /></View>
          </Pressable>
          <Text style={styles.avatarHint}>点击更换头像</Text>
        </View>
        <AppCard style={styles.formCard}>
          <Text style={styles.label}>昵称</Text><Field value={nickname} onChangeText={setNickname} placeholder="请输入昵称" />
          <Text style={styles.label}>性别</Text><View style={styles.genders}>{([['unknown', '保密'], ['male', '男'], ['female', '女']] as const).map(([value, label]) => <Pressable key={value} onPress={() => setGender(value)} style={[styles.gender, gender === value && styles.genderActive]}><Text style={[styles.genderText, gender === value && styles.genderTextActive]}>{label}</Text></Pressable>)}</View>
          <Text style={styles.label}>生日</Text><Field value={birthday} onChangeText={setBirthday} placeholder="例如 1998-08-18" />
          <View style={styles.labelRow}><Text style={styles.label}>个人简介</Text><Text style={styles.counter}>{bio.length}/500</Text></View><Field multiline value={bio} onChangeText={setBio} maxLength={500} placeholder="介绍一下自己" />
        </AppCard>
        <AppButton title="保存资料" icon="check" loading={busy} onPress={save} style={styles.save} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {paddingBottom: spacing.xxl}, avatarSection: {alignItems: 'center', paddingVertical: spacing.xxl}, avatar: {width: 96, height: 96, borderRadius: 48, backgroundColor: colors.surfaceAlt}, avatarFallback: {width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center'}, avatarText: {color: '#1B1609', fontSize: 36, lineHeight: 44, fontWeight: '700'}, cameraBadge: {position: 'absolute', right: 0, bottom: 0, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primary, borderWidth: 3, borderColor: colors.background, alignItems: 'center', justifyContent: 'center'}, avatarHint: {color: colors.primary, ...typography.caption, marginTop: spacing.md}, formCard: {paddingTop: 0}, label: {color: colors.text, ...typography.label, marginTop: spacing.lg, marginBottom: spacing.sm}, labelRow: {flexDirection: 'row', alignItems: 'center'}, counter: {color: colors.subtle, ...typography.caption, marginLeft: 'auto', marginTop: spacing.lg}, genders: {flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm}, gender: {flex: 1, height: 42, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center'}, genderActive: {backgroundColor: colors.primarySoft, borderColor: colors.primary}, genderText: {color: colors.muted, ...typography.label}, genderTextActive: {color: colors.primary}, save: {marginTop: spacing.xl}, pressed: {opacity: 0.7, transform: [{scale: 0.98}]},
});
