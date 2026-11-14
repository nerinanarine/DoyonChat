import React, { useEffect } from 'react';
import SettingsContent, { SettingsContentProps } from './SettingsContent';

interface SettingsDialogProps extends Omit<SettingsContentProps, 'onRequestClose'> {
  open: boolean;
  onClose: () => void;
}

const SettingsDialog: React.FC<SettingsDialogProps> = ({ open, onClose, ...contentProps }) => {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="設定"
        className="w-full max-w-md max-h-full overflow-y-auto bg-white rounded-lg shadow-xl p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <SettingsContent {...contentProps} onRequestClose={onClose} />
      </div>
    </div>
  );
};

export default SettingsDialog;
