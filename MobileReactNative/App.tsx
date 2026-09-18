import React, {useEffect} from 'react';
import {AppState, StatusBar} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {TamaguiProvider, Theme} from '@tamagui/core';
import {RootNavigator} from './src/navigation/RootNavigator';
import {useAuthStore} from './src/stores/auth';
import {colors, tamaguiConfig} from './src/theme';
import {AppToastProvider} from './src/components/AppToast';
import {PrivacyConsentGate} from './src/components/PrivacyConsentGate';
import {sendRiskPresenceHeartbeat} from './src/native/risk';
import {AppUpdateGate} from './src/components/AppUpdateGate';
import {NetworkStatusBanner} from './src/components/NetworkStatusBanner';
import {AppDialogProvider} from './src/components/AppDialog';

/** APP 唯一根组件：恢复登录态后再决定展示登录页或业务页面。 */
export default function App() {
  const restore = useAuthStore(state => state.restore);
  const userId = useAuthStore(state => state.user?.id);
  useEffect(() => { restore().catch(() => undefined); }, [restore]);
  useEffect(() => {
    if (!userId) return;
    const report = () => {
      if (AppState.currentState === 'active') sendRiskPresenceHeartbeat().catch(() => undefined);
    };
    report();
    const timer = setInterval(report, 5 * 60_000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') report();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [userId]);
  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="huanyue">
      <Theme name="huanyue">
        <SafeAreaProvider>
          <StatusBar
            barStyle="light-content"
            backgroundColor={colors.background}
          />
          <AppToastProvider>
            <AppDialogProvider>
              <NetworkStatusBanner />
              <AppUpdateGate>
                <PrivacyConsentGate>
                  <NavigationContainer>
                    <RootNavigator />
                  </NavigationContainer>
                </PrivacyConsentGate>
              </AppUpdateGate>
            </AppDialogProvider>
          </AppToastProvider>
        </SafeAreaProvider>
      </Theme>
    </TamaguiProvider>
  );
}
