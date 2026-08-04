import { listen } from '@tauri-apps/api/event';

import type { Unlisten } from './types';

export interface DeepLinkEvents {
  onAuthCallback: (callback: (url: string) => void) => Promise<Unlisten>;
}

export const deepLinks: DeepLinkEvents = {
  async onAuthCallback(callback) {
    const unlisteners: Unlisten[] = [];

    if (typeof window === 'undefined') return () => {};

    const handler = (event: Event) => {
      const custom = event as CustomEvent<string>;
      if (typeof custom.detail === 'string') {
        callback(custom.detail);
      }
    };
    window.addEventListener('kengui-auth-callback', handler);
    unlisteners.push(() => window.removeEventListener('kengui-auth-callback', handler));

    try {
      unlisteners.push(
        await listen<string>('auth-callback', (event) => callback(event.payload))
      );
    } catch {
      // Browser and test builds do not have a Tauri event bus.
    }

    return () => {
      for (const unlisten of unlisteners) unlisten();
    };
  },
};
