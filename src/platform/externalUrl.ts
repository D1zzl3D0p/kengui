export interface ExternalUrlOpener {
  openExternalUrl: (url: string) => Promise<void>;
}

export const externalUrl: ExternalUrlOpener = {
  async openExternalUrl(url) {
    window.location.assign(url);
  },
};
