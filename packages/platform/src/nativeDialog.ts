import { open, save } from '@tauri-apps/plugin-dialog';

import type { BookFileSelection } from './types';

export interface NativeFileDialog {
  pickBookFile: () => Promise<BookFileSelection>;
  saveM4bFile: (suggestedName?: string) => Promise<string | null>;
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

export async function saveM4bFile(suggestedName = 'audiobook.m4b'): Promise<string | null> {
  try {
    const selected = await save({
      defaultPath: suggestedName,
      filters: [{ name: 'M4B Audiobook', extensions: ['m4b'] }],
    });

    return selected ?? null;
  } catch {
    return null;
  }
}
