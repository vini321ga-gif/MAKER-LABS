import React from 'react';

export type PillVariant = 'emerald' | 'amber' | 'crimson' | 'neutral' | 'blue';

interface StatusPillProps {
  label: string;
  variant: PillVariant;
  className?: string;
}

const VARIANT_STYLES: Record<PillVariant, { container: string; dot: string }> = {
  emerald: {
    container: 'bg-[#ECFDF5] text-[#059669] border-[#A7F3D0]',
    dot: 'bg-[#10B981]',
  },
  amber: {
    container: 'bg-[#FFFBEB] text-[#D97706] border-[#FDE68A]',
    dot: 'bg-[#F59E0B]',
  },
  crimson: {
    container: 'bg-[#FEF2F2] text-[#DC2626] border-[#FECACA]',
    dot: 'bg-[#EF4444]',
  },
  neutral: {
    container: 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]',
    dot: 'bg-[#64748B]',
  },
  blue: {
    container: 'bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]',
    dot: 'bg-[#2563EB]',
  },
};

export const StatusPill: React.FC<StatusPillProps> = ({ label, variant, className = '' }) => {
  const styles = VARIANT_STYLES[variant];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold leading-4 tracking-[0.01em] whitespace-nowrap shrink-0 ${styles.container} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${styles.dot}`} aria-hidden="true" />
      {label}
    </span>
  );
};

export function getProductionStatusBadge(status: string): { label: string; variant: PillVariant } {
  switch (status) {
    case 'completado':
      return { label: 'Completado', variant: 'emerald' };
    case 'operativo':
      return { label: 'Operativo', variant: 'emerald' };
    case 'en_produccion':
      return { label: 'En Producción', variant: 'amber' };
    case 'calentando':
      return { label: 'Calentando', variant: 'amber' };
    case 'mantenimiento':
      return { label: 'Mantenimiento', variant: 'crimson' };
    case 'cola_espera':
    default:
      return { label: 'Cola de Espera', variant: 'neutral' };
  }
}

export function getFinancialStatusBadge(status: string): { label: string; variant: PillVariant } {
  switch (status) {
    case 'cobrado':
      return { label: 'Cobrado', variant: 'emerald' };
    case 'ingreso':
      return { label: 'Ingreso', variant: 'emerald' };
    case 'pendiente':
      return { label: 'Pendiente', variant: 'amber' };
    case 'egreso':
      return { label: 'Egreso', variant: 'crimson' };
    case 'anulado':
      return { label: 'Anulado', variant: 'neutral' };
    default:
      return { label: status, variant: 'neutral' };
  }
}
