import React, {createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState} from 'react';
import {Animated, StyleSheet, Text, View} from 'react-native';
import {AppIcon} from './AppIcon';
import {colors, radii, spacing, typography} from '../theme';

type ToastType = 'success' | 'error' | 'info';
type ToastApi = {show: (message: string, type?: ToastType) => void};
const ToastContext = createContext<ToastApi>({show: () => undefined});

/** 全局轻提示。普通成功与失败不再打断用户操作流程。 */
export function AppToastProvider({children}: {children: ReactNode}) {
  const [toast, setToast] = useState<{message: string; type: ToastType}>();
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback((message: string, type: ToastType = 'info') => {
    if (timer.current) clearTimeout(timer.current);
    setToast({message, type});
    Animated.timing(opacity, {toValue: 1, duration: 180, useNativeDriver: true}).start();
    timer.current = setTimeout(() => Animated.timing(opacity, {toValue: 0, duration: 180, useNativeDriver: true}).start(() => setToast(undefined)), 2200);
  }, [opacity]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return <ToastContext.Provider value={{show}}>{children}{toast ? <Animated.View pointerEvents="none" style={[styles.toast, {opacity, transform: [{translateY: opacity.interpolate({inputRange: [0, 1], outputRange: [12, 0]})}]}]}><View style={[styles.icon, toast.type === 'success' && styles.success, toast.type === 'error' && styles.error]}><AppIcon name={toast.type === 'success' ? 'check' : 'info'} color={toast.type === 'success' ? colors.success : toast.type === 'error' ? colors.danger : colors.primary} size={16} /></View><Text style={styles.text}>{toast.message}</Text></Animated.View> : null}</ToastContext.Provider>;
}

export const useAppToast = () => useContext(ToastContext);

const styles = StyleSheet.create({
  toast: {position: 'absolute', zIndex: 1000, left: spacing.xl, right: spacing.xl, bottom: 104, minHeight: 52, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: '#1A202B', paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 16, elevation: 10},
  icon: {width: 30, height: 30, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center'}, success: {backgroundColor: colors.successSoft}, error: {backgroundColor: colors.dangerSoft}, text: {color: colors.text, ...typography.label, flex: 1, marginLeft: spacing.sm},
});
