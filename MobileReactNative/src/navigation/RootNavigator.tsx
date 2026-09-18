import React from 'react';
import {StyleSheet} from 'react-native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {View as TamaguiView} from '@tamagui/core';
import {AppIcon} from '../components/AppIcon';
import {BrandLoader} from '../components/BrandLoader';
import {EmptyState} from '../components/DesignSystem';
import {Screen} from '../components/Screen';
import {AuthScreen} from '../features/auth/AuthScreen';
import {HomeScreen} from '../features/home/HomeScreen';
import {TasksScreen} from '../features/tasks/TasksScreen';
import {EarningsScreen} from '../features/earnings/EarningsScreen';
import {ProfileScreen} from '../features/profile/ProfileScreen';
import {WithdrawalScreen} from '../features/withdrawal/WithdrawalScreen';
import {ShareScreen} from '../features/share/ShareScreen';
import {InviteRelationsScreen} from '../features/share/InviteRelationsScreen';
import {ProfileEditScreen} from '../features/account/ProfileEditScreen';
import {SecurityScreen} from '../features/account/SecurityScreen';
import {LibraryScreen} from '../features/library/LibraryScreen';
import {HelpScreen} from '../features/support/HelpScreen';
import {AgreementScreen} from '../features/support/AgreementScreen';
import {NotificationsScreen} from '../features/misc/NotificationsScreen';
import {SearchScreen} from '../features/misc/SearchScreen';
import {AboutScreen, SettingsScreen} from '../features/misc/SettingsScreen';
import {brandConfig} from '../config/brand';
import {productModules} from '../config/modules';
import {useAuthStore} from '../stores/auth';
import {colors} from '../theme';
import {
  motionAnimatedProperties,
  tabMotionStates,
} from '../theme/motion.tokens';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
type TabIconProps = {color: string; focused: boolean; size: number};
type TabIconName = 'home' | 'gift' | 'wallet' | 'user';

/** 选中图标使用轻量金色底，避免依赖字符图标导致设备间样式不一致。 */
function TabIcon({name, color, focused}: TabIconProps & {name: TabIconName}) {
  const motionState = focused ? tabMotionStates.active : tabMotionStates.inactive;
  return (
    <TamaguiView
      transition="feedback"
      animateOnly={motionAnimatedProperties}
      opacity={motionState.opacity}
      scale={motionState.scale}
      y={motionState.y}
      style={[styles.tabIcon, focused && styles.tabIconActive]}>
      <AppIcon name={name} color={color} size={22} />
    </TamaguiView>
  );
}

const tabIconRenderers: Record<string, (props: TabIconProps) => React.ReactNode> = {
  首页: props => <TabIcon name="home" {...props} />,
  福利: props => <TabIcon name="gift" {...props} />,
  收益: props => <TabIcon name="wallet" {...props} />,
  我的: props => <TabIcon name="user" {...props} />,
};

function MainTabs() {
  return (
    <Tab.Navigator screenOptions={({route}) => ({
      animation: 'none',
      headerShown: false,
      tabBarStyle: {height: 76, paddingTop: 7, paddingBottom: 7, backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1, elevation: 0},
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.muted,
      tabBarIcon: tabIconRenderers[route.name],
      tabBarLabelStyle: {fontSize: 11, fontWeight: '600', marginTop: 1},
    })}>
      <Tab.Screen name="首页" component={productModules.shortDrama ? HomeScreen : ModuleUnavailableScreen} />
      {productModules.rewards ? <Tab.Screen name="福利" component={TasksScreen} /> : null}
      {productModules.rewards ? <Tab.Screen name="收益" component={EarningsScreen} /> : null}
      <Tab.Screen name="我的" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

const screens: Array<[string, React.ComponentType<any>, string]> = [
  ...(productModules.withdrawals ? [['Withdrawal', WithdrawalScreen, '金币提现'] as [string, React.ComponentType<any>, string]] : []),
  ...(productModules.invitations ? [['Share', ShareScreen, '邀请好友'] as [string, React.ComponentType<any>, string]] : []),
  ...(productModules.invitations ? [['InviteRelations', InviteRelationsScreen, '我的邀请关系'] as [string, React.ComponentType<any>, string]] : []),
  ['ProfileEdit', ProfileEditScreen, '个人资料'],
  ['Security', SecurityScreen, '账户安全'],
  ...(productModules.shortDrama ? [
    ['History', LibraryScreen, '观看历史'] as [string, React.ComponentType<any>, string],
    ['Favorites', LibraryScreen, '我的收藏'] as [string, React.ComponentType<any>, string],
  ] : []),
  ['Settings', SettingsScreen, '设置'],
  ['Help', HelpScreen, '帮助与反馈'],
  ['Agreement', AgreementScreen, '协议与政策'],
  ['Notifications', NotificationsScreen, '通知中心'],
  ...(productModules.shortDrama ? [['Search', SearchScreen, '搜索'] as [string, React.ComponentType<any>, string]] : []),
  ['About', AboutScreen, brandConfig.aboutTitle],
];

function ModuleUnavailableScreen() {
  return (
    <Screen style={styles.unavailableScreen}>
      <EmptyState title="内容模块未启用" description="当前产品未启用短剧内容，请从“我的”继续使用账户功能。" icon="film" />
    </Screen>
  );
}

export function RootNavigator() {
  const {ready, user} = useAuthStore();
  if (!ready) return <BrandLoader fullScreen label="正在恢复登录状态" />;
  if (!user) return <AuthScreen />;
  return (
    <Stack.Navigator screenOptions={{animation: 'slide_from_right', animationDuration: 240, headerStyle: {backgroundColor: colors.background}, headerTintColor: colors.text, headerTitleStyle: {fontWeight: '600'}, contentStyle: {backgroundColor: colors.background}}}>
      <Stack.Screen name="Main" component={MainTabs} options={{headerShown: false}} />
      {screens.map(([name, component, title]) => <Stack.Screen key={name} name={name} component={component} initialParams={name === 'History' ? {mode: 'history'} : name === 'Favorites' ? {mode: 'favorites'} : undefined} options={{title}} />)}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  unavailableScreen: {justifyContent: 'center'},
  tabIcon: {width: 40, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center'},
  tabIconActive: {backgroundColor: colors.primarySoft},
});
