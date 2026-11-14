import React from 'react';
import { Box, CheckCircle2, Flame, Pause, Play, Plus, Wrench } from 'lucide-react';
import { formatMinutes, formatQuetzales } from '../../lib/format';
import type { Machine, MachineStatus, WorkOrder } from '../../types/workshop';
import { getProductionStatusBadge, StatusPill } from '../StatusPill';

interface Print3DQueueViewProps {
  machines: Machine[];
  orders: WorkOrder[];
  onUpdateMachine: (id: string, payload: Partial<Machine>) => Promise<void>;
  onUpdateOrder: (id: number, payload: Partial<WorkOrder>) => Promise<void>;
  onOpenNewOrder: () => void;
}

export const Print3DQueueView: React.FC<Print3DQueueViewProps> = ({
  machines,
  orders,
  onUpdateMachine,
  onUpdateOrder,
  onOpenNewOrder,
}) => {
  const printers = machines.filter((m) => m.category === '3d_printing');
  const printOrders = orders.filter((o) => o.process_type === '3d_printing');

  const cycleStatus = (m: Machine, nextStatus: MachineStatus, nextProgress?: number) => {
    onUpdateMachine(m.id, {
      status: nextStatus,
      progress_pct: nextProgress !== undefined ? nextProgress : m.progress_pct,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="stitch-label-sm">Manufactura Aditiva FDM / SLA</span>
          <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-[#0F172A] leading-8 mt-0.5">
            Cola de Impresión 3D y Telemetría
          </h2>
        </div>
        <button
          type="button"
          onClick={onOpenNewOrder}
          className="h-9 px-4 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[13px] font-medium inline-flex items-center gap-2 cursor-pointer self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          Nueva Orden 3D
        </button>
      </div>

      {/* Printer Fleet Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {printers.map((printer) => (
          <div key={printer.id} className="stitch-card p-6 flex flex-col justify-between space-y-5">
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-lg bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center">
                    <Box className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-[14px] font-semibold text-[#0F172A]">{printer.name}</div>
                    <div className="text-[11px] text-[#64748B] tabular-metrics">
                      {printer.id} · {printer.hours_total.toFixed(1)} hrs uso
                    </div>
                  </div>
                </div>
                <StatusPill {...getProductionStatusBadge(printer.status)} />
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-[12px] tabular-metrics">
                  <span className="text-[#64748B]">
                    Trabajo: <strong className="text-[#0F172A]">{printer.current_job_code || 'Sin asignar'}</strong>
                  </span>
                  <span className="font-semibold text-[#0F172A]">{printer.progress_pct}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-[#F1F5F9] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#2563EB] transition-all duration-300"
                    style={{ width: `${printer.progress_pct}%` }}
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-center tabular-metrics">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[#64748B] font-semibold">Capa</div>
                  <div className="text-[13px] font-semibold text-[#0F172A] mt-0.5">
                    {printer.telemetry.layer_height_mm ?? 0.2} mm
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[#64748B] font-semibold">Cama</div>
                  <div className="text-[13px] font-semibold text-[#0F172A] mt-0.5">
                    {printer.telemetry.bed_temp_c ?? 60}°C
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[#64748B] font-semibold">Boquilla</div>
                  <div className="text-[13px] font-semibold text-[#0F172A] mt-0.5">
                    {printer.telemetry.nozzle_temp_c ?? 220}°C
                  </div>
                </div>
              </div>

              <div className="mt-3 text-[12px] text-[#64748B] flex items-center justify-between">
                <span>Material cargado:</span>
                <span className="font-medium text-[#0F172A]">{printer.telemetry.filament || 'PETG'}</span>
              </div>
            </div>

            <div className="pt-3 border-t border-[#E2E8F0] flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  cycleStatus(
                    printer,
                    'en_produccion',
                    Math.min(100, (printer.progress_pct || 0) + 15)
                  )
                }
                className="flex-1 h-8 px-2.5 rounded-lg bg-[#0F172A] hover:bg-[#1E293B] text-white text-[12px] font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Play className="h-3.5 w-3.5" />
                Avanzar +15%
              </button>
              <button
                type="button"
                onClick={() => cycleStatus(printer, 'calentando', 10)}
                title="Precalentar cama y boquilla"
                className="h-8 px-2.5 rounded-lg border border-[#E2E8F0] bg-white hover:bg-[#FFFBEB] hover:text-[#D97706] text-[12px] font-medium text-[#475569] inline-flex items-center gap-1 cursor-pointer"
              >
                <Flame className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => cycleStatus(printer, 'cola_espera', 0)}
                title="Poner en espera"
                className="h-8 px-2.5 rounded-lg border border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] text-[12px] font-medium text-[#475569] inline-flex items-center gap-1 cursor-pointer"
              >
                <Pause className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => cycleStatus(printer, 'mantenimiento')}
                title="Enviar a mantenimiento"
                className="h-8 px-2.5 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] hover:bg-[#FEE2E2] text-[#DC2626] text-[12px] font-medium inline-flex items-center gap-1 cursor-pointer"
              >
                <Wrench className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 3D Printing Work Queue Table */}
      <div className="stitch-card overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
          <div>
            <span className="stitch-label-sm">Planificación de Bandejas</span>
            <h3 className="text-[16px] font-semibold text-[#0F172A]">
              Cola de Trabajos de Impresión 3D
            </h3>
          </div>
          <span className="text-[12px] text-[#64748B] tabular-metrics">{printOrders.length} órdenes</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F8FAFC] h-10 border-b border-[#E2E8F0]">
                <th className="px-4 stitch-label-sm">Código</th>
                <th className="px-4 stitch-label-sm">Cliente & Especificación</th>
                <th className="px-4 stitch-label-sm">Equipo</th>
                <th className="px-4 stitch-label-sm">Material</th>
                <th className="px-4 stitch-label-sm">Tiempo</th>
                <th className="px-4 stitch-label-sm">Estado</th>
                <th className="px-4 stitch-label-sm text-right">Importe (Q)</th>
                <th className="px-4 stitch-label-sm text-right">Control</th>
              </tr>
            </thead>
            <tbody>
              {printOrders.map((order) => (
                <tr key={order.id} className="h-[52px] border-b border-[#F1F5F9] hover:bg-[#F8FAFC]">
                  <td className="px-4 text-[13px] font-semibold text-[#0F172A] tabular-metrics whitespace-nowrap">
                    {order.order_code}
                  </td>
                  <td className="px-4">
                    <div className="text-[13px] font-medium text-[#0F172A]">{order.client_name}</div>
                    <div className="text-[11px] text-[#64748B] truncate max-w-[260px]">
                      {order.description} ({order.quantity} pzs)
                    </div>
                  </td>
                  <td className="px-4 text-[12px] text-[#475569] tabular-metrics whitespace-nowrap">
                    {order.machine_id || 'Sin asignar'}
                  </td>
                  <td className="px-4 text-[12px] text-[#475569]">{order.material}</td>
                  <td className="px-4 text-[12px] text-[#475569] tabular-metrics whitespace-nowrap">
                    {formatMinutes(order.estimated_minutes)}
                  </td>
                  <td className="px-4">
                    <StatusPill {...getProductionStatusBadge(order.production_status)} />
                  </td>
                  <td className="px-4 text-right text-[13px] font-medium text-[#0F172A] tabular-metrics whitespace-nowrap">
                    {formatQuetzales(order.total_gtq)}
                  </td>
                  <td className="px-4 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
                      {order.production_status === 'cola_espera' && (
                        <button
                          type="button"
                          onClick={() => onUpdateOrder(order.id, { production_status: 'en_produccion' })}
                          className="h-7 px-2.5 rounded-md bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[11px] font-medium cursor-pointer"
                        >
                          Iniciar
                        </button>
                      )}
                      {order.production_status !== 'completado' && (
                        <button
                          type="button"
                          onClick={() => onUpdateOrder(order.id, { production_status: 'completado' })}
                          className="h-7 px-2.5 rounded-md border border-[#A7F3D0] bg-[#ECFDF5] text-[#059669] hover:bg-[#D1FAE5] text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          Listo
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
