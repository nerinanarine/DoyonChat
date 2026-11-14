import React, { useState } from 'react';
import { Settings } from 'lucide-react';
import SettingsContent, { SettingsContentProps } from './SettingsContent';

type SettingsMenuProps = Omit<SettingsContentProps, 'onRequestClose'>;

const SettingsMenu: React.FC<SettingsMenuProps> = (props) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        title="設定"
        aria-label="設定"
        className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600"
      >
        <Settings size={18} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 top-full mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-20 p-4"
          >
            <SettingsContent {...props} onRequestClose={() => setOpen(false)} />
          </div>
        </>
      )}
    </div>
  );
};

export default SettingsMenu;
