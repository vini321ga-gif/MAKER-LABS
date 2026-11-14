import React from 'react';
import type { DocTypeFilter } from '../types/workshop';

interface QuetzalSwitcherProps {
  value: DocTypeFilter;
  onChange: (next: DocTypeFilter) => void;
}

const OPTIONS: Array<{ id: DocTypeFilter; label: string }> = [
  { id: 'all', label: 'Consolidado (Q)' },
  { id: 'factura_sat', label: 'Factura SAT' },
  { id: 'comprobante_taller', label: 'Comprobante Taller' },
];

export const QuetzalSwitcher: React.FC<QuetzalSwitcherProps> = ({ value, onChange }) => {
  return (
    <div
      className="inline-flex items-center rounded-lg border border-[#E2E8F0] bg-[#F1F5F9] p-1"
      role="tablist"
      aria-label="Selector de régimen documental en Quetzales"
    >
      {OPTIONS.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.id)}
            className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-all whitespace-nowrap shrink-0 ${
              active
                ? 'bg-[#FFFFFF] text-[#0F172A] shadow-[0_1px_2px_0_rgba(15,23,42,0.06)] border border-[#E2E8F0]'
                : 'text-[#64748B] hover:text-[#0F172A] border border-transparent'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};
