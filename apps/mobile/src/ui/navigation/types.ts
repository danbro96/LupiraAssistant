import type { NavigatorScreenParams } from '@react-navigation/native';

/** The tabs the user lives in: the assistant's queue, and the comms archive. */
export type TabParamList = {
  InboxTab: undefined;
  ArchiveTab: undefined;
};

export type RootStackParamList = {
  SignIn: undefined;
  Tabs: NavigatorScreenParams<TabParamList>;
  Settings: undefined;
  DebugLog: undefined;
  Developer: undefined;
  EditProposal: { itemId: string };
  Conversations: undefined;
  Thread: { conversationId: string; aroundMessageId?: string };
  Connectors: undefined;
  Preferences: undefined;
};
