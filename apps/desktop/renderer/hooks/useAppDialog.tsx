'use client';

import { useCallback, useState } from 'react';

type DialogState =
  | null
  | {
      kind: 'alert';
      message: string;
      title?: string;
      resolve: () => void;
    }
  | {
      kind: 'confirm';
      message: string;
      title?: string;
      resolve: (ok: boolean) => void;
    };

export function useAppDialog() {
  const [dialog, setDialog] = useState<DialogState>(null);

  const alert = useCallback(
    (message: string, title = '알림') =>
      new Promise<void>((resolve) => {
        setDialog({ kind: 'alert', message, title, resolve: () => resolve() });
      }),
    []
  );

  const confirm = useCallback(
    (message: string, title = '확인') =>
      new Promise<boolean>((resolve) => {
        setDialog({ kind: 'confirm', message, title, resolve });
      }),
    []
  );

  const dismiss = useCallback(() => {
    setDialog((d) => {
      if (d?.kind === 'confirm') d.resolve(false);
      else if (d?.kind === 'alert') d.resolve();
      return null;
    });
  }, []);

  const confirmYes = useCallback(() => {
    setDialog((d) => {
      if (d?.kind === 'confirm') d.resolve(true);
      return null;
    });
  }, []);

  const alertOk = useCallback(() => {
    setDialog((d) => {
      if (d?.kind === 'alert') d.resolve();
      return null;
    });
  }, []);

  return { dialog, alert, confirm, dismiss, confirmYes, alertOk };
}
