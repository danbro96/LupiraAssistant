import { darkColors as coreDark, lightColors as coreLight, type Palette as CorePalette } from '@danbro96/lupira-tokens-core/color';

/** The shared estate core plus the assistant's own status/banner/toast semantics. */
export interface Palette extends CorePalette {
  onAccent: string;
  warning: string;
  success: string;
  pending: string;
  failed: string;
  bannerOffline: string;
  bannerUnreachable: string;
  bannerSyncing: string;
  toastBg: string;
  toastAction: string;
}

export const lightColors: Palette = {
  ...coreLight,
  onAccent: '#ffffff',
  warning: '#5b4b18',
  success: '#1f7a4d',
  pending: '#d8a200',
  failed: '#b3261e',
  bannerOffline: '#5b4b18',
  bannerUnreachable: '#7a1f1f',
  bannerSyncing: '#0f766e',
  toastBg: '#2b2f36',
  toastAction: '#2dd4bf',
};

export const darkColors: Palette = {
  ...coreDark,
  onAccent: '#ffffff',
  warning: '#d8b24a',
  success: '#5fd49b',
  pending: '#d8a200',
  failed: '#f2675e',
  bannerOffline: '#5b4b18',
  bannerUnreachable: '#7a1f1f',
  bannerSyncing: '#115e59',
  toastBg: '#2b2f36',
  toastAction: '#2dd4bf',
};
