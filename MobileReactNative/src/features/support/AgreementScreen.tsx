import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { appApi } from '../../api/app';
import { RichText } from '../../components/RichText';
import { Screen } from '../../components/Screen';
import { colors } from '../../theme';
export function AgreementScreen() {
  const route = useRoute<any>();
  const [title, setTitle] = useState('加载中…');
  const [content, setContent] = useState('');
  useEffect(() => {
    const code =
      route.params?.type === 'privacy' ? 'PRIVACY_POLICY' : 'USER_AGREEMENT';
    appApi
      .document(code)
      .then(x => {
        setTitle(x.title);
        setContent(x.content);
      })
      .catch(e => {
        setTitle('加载失败');
        setContent(e instanceof Error ? e.message : '暂时无法读取文档');
      });
  }, [route.params?.type]);
  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>
        <Text style={s.title}>{title}</Text>
        <RichText content={content} />
      </ScrollView>
    </Screen>
  );
}
const s = StyleSheet.create({
  scrollContent: {paddingBottom: 48},
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
    marginVertical: 20,
  },
});
