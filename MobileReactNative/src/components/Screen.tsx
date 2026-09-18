import React from 'react';
import {StyleSheet, View, ViewProps} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, layout } from '../theme';
export function Screen({children, style, ...props}: ViewProps) {
  return (
    <SafeAreaView style={s.safe}>
      <View style={[s.body, style]} {...props}>
        {children}
      </View>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  body: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: layout.pagePadding,
  },
});
