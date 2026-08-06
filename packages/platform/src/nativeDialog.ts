import { open, save } from '@tauri-apps/plugin-dialog';

import { browserDownloadPath, registerBrowserFile } from './browserFiles';
import { isTauriRuntime } from './runtime';
import type { BookFileSelection } from './types';

export interface NativeFileDialog {
  pickBookFile: () => Promise<BookFileSelection>;
  saveM4bFile: (suggestedName?: string) => Promise<string | null>;
}

function pickBrowserBookFile(): Promise<BookFileSelection> {
  if (typeof document === 'undefined' || !document.body) return Promise.resolve(null);

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.epub,.mobi,.azw,.fb2';
    input.hidden = true;
    document.body.append(input);

    let settled = false;
    const finish = (selection: BookFileSelection) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(selection);
    };

    input.addEventListener('change', () => {
      const file = input.files?.item(0);
      finish(file ? registerBrowserFile(file) : null);
    }, { once: true });
    input.addEventListener('cancel', () => finish(null), { once: true });
    input.click();
  });
}

export async function pickBookFile(): Promise<BookFileSelection> {
  if (!isTauriRuntime()) return pickBrowserBookFile();

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
  if (!isTauriRuntime()) return browserDownloadPath(suggestedName);

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
