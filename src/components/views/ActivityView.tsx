import React from 'react';
import { ClipboardList, RefreshCw } from 'lucide-react';
import { formatRoleLabel } from '../../lib/format';
import type { ActivityEvent } from '../../types/workshop';

interface ActivityViewProps {
  events: ActivityEvent[];
  loading: boolean;
  onRefresh: () => void;
}

const ACTION_LABELS: Record<string, string> = {
  order_created: 'Orden creada',
  advance_registered: 'Anticipo registrado',
  full_payment_registered: 'Pago total registrado',
  capital_income_created: 'Ingreso de capital registrado',
  expense_created: 'Egreso registrado',
  order_deleted: 'Orden borrada',
  financial_entry_deleted: 'Movimiento financiero borrado',
  inventory_item_deleted: 'Insumo eliminado',
  user_deleted: 'Usuario eliminado',
  attachment_deleted: 'Adjunto eliminado',
};

export const ActivityView: React.FC<ActivityViewProps> = ({ events, loading, onRefresh }) => (
  <div className="space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <span className="stitch-label-sm">Auditoría de acciones</span>
        <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-[#0F172A] leading-8 mt-0.5">
          Registro de actividad
        </h2>
        <p className="text-[13px] text-[#64748B] mt-1">
          Órdenes, anticipos, ingresos, egresos y borrados con el usuario responsable.
        </p>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        className="h-9 px-3 rounded-lg border border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] text-[13px] font-medium inline-flex items-center gap-2 disabled:opacity-60"
      >
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        Actualizar
      </button>
    </div>

    <div className="stitch-card overflow-hidden">
      <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-[#2563EB]" />
          <h3 className="text-[15px] font-semibold text-[#0F172A]">Últimos movimientos</h3>
        </div>
        <span className="text-[12px] text-[#64748B] tabular-metrics">{events.length} registros</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#F8FAFC] h-10 border-b border-[#E2E8F0]">
              <th className="px-4 stitch-label-sm">Fecha y hora</th>
              <th className="px-4 stitch-label-sm">Usuario</th>
              <th className="px-4 stitch-label-sm">Acción</th>
              <th className="px-4 stitch-label-sm">Registro</th>
              <th className="px-4 stitch-label-sm">Detalle / justificación</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-[13px] text-[#64748B]">
                  {loading ? 'Cargando actividad…' : 'Todavía no hay movimientos registrados.'}
                </td>
              </tr>
            ) : events.map((event) => (
              <tr key={event.id} className="border-b border-[#F1F5F9] align-top">
                <td className="px-4 py-3 text-[12px] text-[#475569] whitespace-nowrap">
                  {new Date(event.created_at.replace(' ', 'T') + (event.created_at.endsWith('Z') ? '' : 'Z')).toLocaleString('es-GT')}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="text-[13px] font-medium text-[#0F172A]">{event.actor_name}</div>
                  <div className="text-[11px] text-[#64748B]">{formatRoleLabel(event.actor_role as any)}</div>
                </td>
                <td className="px-4 py-3 text-[13px] font-medium text-[#1E293B]">
                  {ACTION_LABELS[event.action] || event.action}
                </td>
                <td className="px-4 py-3 text-[12px] text-[#475569] whitespace-nowrap">
                  {event.entity_label}
                </td>
                <td className="px-4 py-3 text-[12px] text-[#475569] min-w-[280px]">{event.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);
