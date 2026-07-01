import { invoke } from '@tauri-apps/api/core';

export interface NativeAuthCallback {
  prepareAuthRedirectUrl: () => Promise<string | null>;
}

export const authCallback: NativeAuthCallback = {
  async prepareAuthRedirectUrl() {
    try {
      return await invoke<string>('start_auth_callback_listener');
    } catch {
      return null;
    }
  },
};
