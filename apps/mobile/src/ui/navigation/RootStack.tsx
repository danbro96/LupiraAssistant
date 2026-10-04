import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { RegisterDeviceScreen } from '../screens/RegisterDeviceScreen';
import { InboxScreen } from '../screens/InboxScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { DebugLogScreen } from '@danbro96/lupira-expo-diagnostics/DebugLogScreen';
import { DeveloperScreen } from '../screens/DeveloperScreen';
import { EditProposalScreen } from '../screens/EditProposalScreen';
import { ArchiveSearchScreen } from '../screens/ArchiveSearchScreen';
import { ConversationsScreen } from '../screens/ConversationsScreen';
import { ThreadScreen } from '../screens/ThreadScreen';
import { ConnectorsScreen } from '../screens/ConnectorsScreen';
import { PreferencesScreen } from '../screens/PreferencesScreen';
import { useDevice } from '../../state/device-store';
import { useColors } from '../theme';
import type { RootStackParamList, TabParamList } from './types';
import { ICONS } from '../icons';
import { SettingsButton } from '@danbro96/lupira-expo-paper/components/SettingsButton';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<TabParamList>();

// Gated on device registration: the register flow until a device key is stored, then the tabs
// (Inbox / Archive) with Settings and the detail screens pushed over them.
export function RootStack() {
  const registered = useDevice((s) => s.registered);

  return (
    <Stack.Navigator>
      {registered ? (
        <>
          <Stack.Screen name="Tabs" component={TabLayout} options={{ headerShown: false }} />
          <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
          <Stack.Screen name="Developer" component={DeveloperScreen} options={{ title: 'Developer' }} />
          <Stack.Screen name="DebugLog" component={DebugLogScreen} options={{ title: 'Debug log' }} />
          <Stack.Screen name="EditProposal" component={EditProposalScreen} options={{ title: 'Edit proposal' }} />
          <Stack.Screen name="Conversations" component={ConversationsScreen} options={{ title: 'Conversations' }} />
          <Stack.Screen name="Thread" component={ThreadScreen} options={{ title: 'Thread' }} />
          <Stack.Screen name="Connectors" component={ConnectorsScreen} options={{ title: 'Sources' }} />
          <Stack.Screen name="Preferences" component={PreferencesScreen} options={{ title: 'Notifications' }} />
        </>
      ) : (
        <Stack.Screen name="RegisterDevice" component={RegisterDeviceScreen} options={{ headerShown: false }} />
      )}
    </Stack.Navigator>
  );
}

function TabLayout() {
  const c = useColors();
  return (
    <Tabs.Navigator
      screenOptions={{
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textMuted,
        headerRight: () => <SettingsButton />,
      }}
    >
      <Tabs.Screen
        name="InboxTab"
        component={InboxScreen}
        options={{
          title: 'Inbox',
          headerTitle: 'Lupira Assistant',
          tabBarIcon: ({ color, size }) => <MaterialIcons name={ICONS.email} size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="ArchiveTab"
        component={ArchiveSearchScreen}
        options={{
          title: 'Archive',
          headerTitle: 'Archive',
          tabBarIcon: ({ color, size }) => <MaterialIcons name={ICONS.search} size={size} color={color} />,
        }}
      />
    </Tabs.Navigator>
  );
}
