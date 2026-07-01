import { openUrl } from '@tauri-apps/plugin-opener';

export interface ExternalUrlOpener {
  openExternalUrl: (url: string) => Promise<void>;
}

export const externalUrl: ExternalUrlOpener = {
  async openExternalUrl(url) {
    try {
      await openUrl(url);
    } catch {
      window.location.assign(url);
    }
  },
};
