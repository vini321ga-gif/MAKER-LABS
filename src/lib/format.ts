import type { DocType, InventoryCategory, MachineCategory, UserRole } from '../types/workshop';

export function formatQuetzales(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `Q ${safe.toLocaleString('es-GT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function calculateSatBreakdown(
  grossTotal: number,
  docType: DocType
): { subtotal: number; iva: number; total: number } {
  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const total = round2(Math.max(0, grossTotal));
  if (docType === 'factura_sat') {
    const subtotal = round2(total / 1.12);
    const iva = round2(total - subtotal);
    return { subtotal, iva, total };
  }
  return { subtotal: total, iva: 0, total };
}

export function formatProcessLabel(process: MachineCategory): string {
  switch (process) {
    case '3d_printing':
      return 'Impresión 3D';
    case 'laser':
      return 'Corte Láser';
    case 'uv_dtf':
      return 'Impresión UV DTF';
  }
}

export function formatInventoryCategory(cat: InventoryCategory): string {
  switch (cat) {
    case 'filamento_3d':
      return 'Filamento 3D';
    case 'resina_3d':
      return 'Resina 3D';
    case 'lamina_laser':
      return 'Plancha / Lámina';
    case 'tinta_uv_dtf':
      return 'Tinta UV DTF';
    case 'film_dtf':
      return 'Film UV DTF';
  }
}

export function formatRoleLabel(role: UserRole): string {
  switch (role) {
    case 'admin':
      return 'Director / Admin';
    case 'operator':
      return 'Operador de Planta';
    case 'finance':
      return 'Finanzas y SAT';
  }
}

export function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
