import type { Unlisten } from './types';

export interface DeepLinkEvents {
  onAuthCallback: (callback: (url: string) => void) => Promise<Unlisten>;
}

export const deepLinks: DeepLinkEvents = {
  async onAuthCallback(callback) {
    if (typeof window === 'undefined') return () => {};

    const handler = (event: Event) => {
      const custom = event as CustomEvent<string>;
      if (typeof custom.detail === 'string') {
        callback(custom.detail);
      }
    };
    window.addEventListener('kengui-auth-callback', handler);
    return () => window.removeEventListener('kengui-auth-callback', handler);
  },
};
