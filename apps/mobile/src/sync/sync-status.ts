import { create } from 'zustand';

// Lives in the SYNC layer (not state/) so sync can update it without importing upward.

interface SyncStatusState {
  uploading: boolean;
  online: boolean;

  setUploading: (uploading: boolean) => void;
  setOnline: (online: boolean) => void;
}

export const useSyncStatus = create<SyncStatusState>((set) => ({
  uploading: false,
  online: true,

  setUploading: (uploading) => set({ uploading }),
  setOnline: (online) => set({ online }),
}));
