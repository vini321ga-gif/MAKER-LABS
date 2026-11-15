import React from 'react';
import type { DocTypeFilter } from '../types/workshop';

interface QuetzalSwitcherProps {
  value: DocTypeFilter;
  onChange: (next: DocTypeFilter) => void;
}

export const QuetzalSwitcher: React.FC<QuetzalSwitcherProps> = () => (
  <div className="inline-flex items-center rounded-lg border border-[#E2E8F0] bg-[#F1F5F9] p-1">
    <span className="px-3 py-1.5 text-[12px] font-medium rounded-md bg-[#FFFFFF] text-[#0F172A] shadow-[0_1px_2px_0_rgba(15,23,42,0.06)] border border-[#E2E8F0] whitespace-nowrap">
      Registro general (Q)
    </span>
  </div>
);
