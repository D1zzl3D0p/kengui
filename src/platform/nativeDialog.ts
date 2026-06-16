import { open } from '@tauri-apps/plugin-dialog';

import type { BookFileSelection } from './types';

export interface NativeFileDialog {
  pickBookFile: () => Promise<BookFileSelection>;
}

export async function pickBookFile(): Promise<BookFileSelection> {
  try {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'Ebooks', extensions: ['epub', 'mobi', 'azw', 'fb2'] }],
    });

    if (!selected || Array.isArray(selected)) {
      return null;
    }

    return selected;
  } catch {
    return null;
  }
}
