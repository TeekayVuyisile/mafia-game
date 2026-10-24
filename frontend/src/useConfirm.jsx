import { useCallback, useRef, useState } from 'react';
import ConfirmDialog from './components/ConfirmDialog';

/**
 * Promise-based replacement for window.confirm:
 *   const [confirmDialog, confirm] = useConfirm();
 *   if (await confirm({ title, message, confirmLabel, tone: 'danger' })) { ... }
 * Render `confirmDialog` once in the component.
 */
export function useConfirm() {
  // Options outlive `open` so the text doesn't blank out during the closing animation
  const [state, setState] = useState({ open: false, options: {} });
  const resolver = useRef(null);

  const confirm = useCallback((options) => new Promise(resolve => {
    resolver.current?.(false);
    resolver.current = resolve;
    setState({ open: true, options });
  }), []);

  const settle = useCallback((result) => {
    resolver.current?.(result);
    resolver.current = null;
    setState(prev => ({ ...prev, open: false }));
  }, []);

  const handleConfirm = useCallback(() => settle(true), [settle]);
  const handleCancel = useCallback(() => settle(false), [settle]);

  const dialog = (
    <ConfirmDialog
      {...state.options}
      open={state.open}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  return [dialog, confirm];
}
