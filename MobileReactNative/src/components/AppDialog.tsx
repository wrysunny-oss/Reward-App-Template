import React, {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {AppIcon, AppIconName} from './AppIcon';
import {AppButton, AppCard} from './DesignSystem';
import {colors, radii, spacing, typography} from '../theme';

export type AppDialogTone = 'info' | 'success' | 'warning' | 'danger';

export interface AppDialogOptions {
  title: string;
  message?: string;
  tone?: AppDialogTone;
  confirmText?: string;
  cancelText?: string;
  dismissible?: boolean;
}

interface PendingDialog extends AppDialogOptions {
  resolve: (confirmed: boolean) => void;
}

interface AppDialogApi {
  alert: (options: AppDialogOptions) => Promise<void>;
  confirm: (options: AppDialogOptions) => Promise<boolean>;
}

const AppDialogContext = createContext<AppDialogApi | undefined>(undefined);

const toneMeta: Record<AppDialogTone, {icon: AppIconName; color: string; background: string}> = {
  info: {icon: 'info', color: colors.primary, background: colors.primarySoft},
  success: {icon: 'check', color: colors.success, background: colors.successSoft},
  warning: {icon: 'info', color: colors.primary, background: colors.primarySoft},
  danger: {icon: 'info', color: colors.danger, background: colors.dangerSoft},
};

/** 全局业务弹窗。系统权限和第三方 SDK 弹窗仍由原生层负责。 */
export function AppDialogProvider({children}: {children: ReactNode}) {
  const [active, setActive] = useState<PendingDialog>();
  const queue = useRef<PendingDialog[]>([]);
  const activeRef = useRef<PendingDialog | undefined>(undefined);
  const closing = useRef(false);
  const entrance = useRef(new Animated.Value(0)).current;

  const showNext = useCallback(() => {
    if (activeRef.current || queue.current.length === 0) return;
    const next = queue.current.shift();
    if (!next) return;
    activeRef.current = next;
    setActive(next);
  }, []);

  const enqueue = useCallback((options: AppDialogOptions) => new Promise<boolean>(resolve => {
    queue.current.push({...options, resolve});
    showNext();
  }), [showNext]);

  const alert = useCallback(async (options: AppDialogOptions) => {
    await enqueue({...options, cancelText: undefined});
  }, [enqueue]);

  const confirm = useCallback((options: AppDialogOptions) => enqueue({
    ...options,
    cancelText: options.cancelText ?? '取消',
    dismissible: options.dismissible ?? false,
  }), [enqueue]);

  const close = useCallback((confirmed: boolean) => {
    const current = activeRef.current;
    if (!current || closing.current) return;
    closing.current = true;
    Animated.parallel([
      Animated.timing(entrance, {toValue: 0, duration: 140, useNativeDriver: true}),
    ]).start(() => {
      activeRef.current = undefined;
      setActive(undefined);
      closing.current = false;
      current.resolve(confirmed);
      requestAnimationFrame(showNext);
    });
  }, [entrance, showNext]);

  const playEntrance = useCallback(() => {
    entrance.stopAnimation();
    entrance.setValue(0);
    Animated.spring(entrance, {
      toValue: 1,
      damping: 16,
      stiffness: 190,
      mass: 0.82,
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  useEffect(() => () => {
    entrance.stopAnimation();
    activeRef.current?.resolve(false);
    queue.current.forEach(item => item.resolve(false));
    queue.current = [];
  }, [entrance]);

  const api = useMemo(() => ({alert, confirm}), [alert, confirm]);
  const tone = active?.tone ?? 'info';
  const meta = toneMeta[tone];
  const dismissible = active?.dismissible ?? !active?.cancelText;

  return (
    <AppDialogContext.Provider value={api}>
      {children}
      <Modal
        visible={Boolean(active)}
        transparent
        animationType="none"
        statusBarTranslucent
        onShow={playEntrance}
        onRequestClose={() => dismissible && close(false)}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={dismissible ? '关闭弹窗' : undefined}
          style={styles.backdrop}
          onPress={() => dismissible && close(false)}>
          <Pressable onPress={event => event.stopPropagation()}>
            <Animated.View
              style={{
                opacity: entrance,
                transform: [
                  {translateY: entrance.interpolate({inputRange: [0, 1], outputRange: [20, 0]})},
                  {scale: entrance.interpolate({inputRange: [0, 1], outputRange: [0.94, 1]})},
                ],
              }}>
              <AppCard style={styles.dialog} elevated>
                <View style={[styles.iconWrap, {backgroundColor: meta.background}]}>
                  <AppIcon name={meta.icon} color={meta.color} size={26} strokeWidth={2.2} />
                </View>
                <Text style={styles.title}>{active?.title}</Text>
                {active?.message ? <Text style={styles.message}>{active.message}</Text> : null}
                <View style={styles.actions}>
                  {active?.cancelText ? (
                    <AppButton
                      title={active.cancelText}
                      variant="secondary"
                      onPress={() => close(false)}
                      style={styles.action}
                    />
                  ) : null}
                  <AppButton
                    title={active?.confirmText ?? '知道了'}
                    variant={tone === 'danger' ? 'danger' : 'primary'}
                    onPress={() => close(true)}
                    style={styles.action}
                  />
                </View>
              </AppCard>
            </Animated.View>
          </Pressable>
        </Pressable>
      </Modal>
    </AppDialogContext.Provider>
  );
}

export function useAppDialog() {
  const context = useContext(AppDialogContext);
  if (!context) throw new Error('useAppDialog must be used inside AppDialogProvider');
  return context;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: 'rgba(3, 5, 9, 0.78)',
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    borderRadius: radii.xl,
  },
  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.text,
    ...typography.section,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  message: {
    color: colors.muted,
    ...typography.body,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  actions: {
    width: '100%',
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  action: {flex: 1},
});
