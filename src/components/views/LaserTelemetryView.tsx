import React from 'react';
import { CheckCircle2, Play, Plus, Wind, Wrench, Zap } from 'lucide-react';
import { formatMinutes, formatQuetzales } from '../../lib/format';
import type { Machine, WorkOrder } from '../../types/workshop';
import { getProductionStatusBadge, StatusPill } from '../StatusPill';

interface LaserTelemetryViewProps {
  machines: Machine[];
  orders: WorkOrder[];
  onUpdateMachine: (id: string, payload: Partial<Machine>) => Promise<void>;
  onUpdateOrder: (id: number, payload: Partial<WorkOrder>) => Promise<void>;
  onOpenNewOrder: () => void;
}

export const LaserTelemetryView: React.FC<LaserTelemetryViewProps> = ({
  machines,
  orders,
  onUpdateMachine,
  onUpdateOrder,
  onOpenNewOrder,
}) => {
  const lasers = machines.filter((m) => m.category === 'laser');
  const laserOrders = orders.filter((o) => o.process_type === 'laser');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="stitch-label-sm">Corte CO2 y Grabado Fibra Galvo</span>
          <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-[#0F172A] leading-8 mt-0.5">
            Telemetría de Corte Láser
          </h2>
        </div>
        <button
          type="button"
          onClick={onOpenNewOrder}
          className="h-9 px-4 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[13px] font-medium inline-flex items-center gap-2 cursor-pointer self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          Nueva Orden Láser
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {lasers.map((laser) => {
          const tubeLife = laser.telemetry.tube_life_pct ?? 85;
          const airAssist = Boolean(laser.telemetry.air_assist);
          return (
            <div key={laser.id} className="stitch-card p-6 space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-[#FFFBEB] text-[#D97706] flex items-center justify-center">
                    <Zap className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-[16px] font-semibold text-[#0F172A]">{laser.name}</h3>
                    <p className="text-[12px] text-[#64748B] tabular-metrics">
                      {laser.model} · {laser.hours_total.toFixed(1)} hrs totales
                    </p>
                  </div>
                </div>
                <StatusPill {...getProductionStatusBadge(laser.status)} />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                  <div className="stitch-label-sm">Vida Tubo</div>
                  <div className="text-[18px] font-semibold text-[#0F172A] tabular-metrics mt-1">
                    {tubeLife}%
                  </div>
                </div>
                <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                  <div className="stitch-label-sm">Potencia</div>
                  <div className="text-[18px] font-semibold text-[#0F172A] tabular-metrics mt-1">
                    {laser.telemetry.power_pct ?? 75}%
                  </div>
                </div>
                <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                  <div className="stitch-label-sm">Velocidad</div>
                  <div className="text-[18px] font-semibold text-[#0F172A] tabular-metrics mt-1">
                    {laser.telemetry.speed_mm_s ?? 30} mm/s
                  </div>
                </div>
                <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                  <div className="stitch-label-sm">Extracción</div>
                  <div className="text-[18px] font-semibold text-[#0F172A] tabular-metrics mt-1">
                    {laser.telemetry.exhaust_kpa ?? 2.1} kPa
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-[12px] tabular-metrics">
                  <span className="text-[#64748B]">
                    Trabajo activo: <strong className="text-[#0F172A]">{laser.current_job_code || 'Libre'}</strong>
                  </span>
                  <span className="font-semibold text-[#0F172A]">{laser.progress_pct}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-[#F1F5F9] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#F59E0B] transition-all duration-300"
                    style={{ width: `${laser.progress_pct}%` }}
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateMachine(laser.id, {
                      telemetry: { ...laser.telemetry, air_assist: !airAssist },
                    })
                  }
                  className={`h-8 px-3 rounded-lg border text-[12px] font-medium inline-flex items-center gap-1.5 cursor-pointer ${
                    airAssist
                      ? 'border-[#A7F3D0] bg-[#ECFDF5] text-[#059669]'
                      : 'border-[#E2E8F0] bg-white text-[#475569]'
                  }`}
                >
                  <Wind className="h-3.5 w-3.5" />
                  Air Assist: {airAssist ? 'Activado' : 'Apagado'}
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateMachine(laser.id, {
                        status: 'en_produccion',
                        progress_pct: Math.min(100, (laser.progress_pct || 0) + 20),
                      })
                    }
                    className="h-8 px-3 rounded-lg bg-[#0F172A] hover:bg-[#1E293B] text-white text-[12px] font-medium inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Play className="h-3.5 w-3.5" />
                    Avanzar +20%
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateMachine(laser.id, {
                        status: laser.status === 'mantenimiento' ? 'operativo' : 'mantenimiento',
                      })
                    }
                    className="h-8 px-3 rounded-lg border border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] text-[12px] font-medium text-[#475569] inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Wrench className="h-3.5 w-3.5" />
                    {laser.status === 'mantenimiento' ? 'Reactivar' : 'Calibrar'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Laser Orders Table */}
      <div className="stitch-card overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
          <div>
            <span className="stitch-label-sm">Trabajos de Corte y Grabado</span>
            <h3 className="text-[16px] font-semibold text-[#0F172A]">Órdenes de Corte Láser</h3>
          </div>
          <span className="text-[12px] text-[#64748B] tabular-metrics">{laserOrders.length} órdenes</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F8FAFC] h-10 border-b border-[#E2E8F0]">
                <th className="px-4 stitch-label-sm">Código</th>
                <th className="px-4 stitch-label-sm">Cliente & Proyecto</th>
                <th className="px-4 stitch-label-sm">Material</th>
                <th className="px-4 stitch-label-sm">Tiempo</th>
                <th className="px-4 stitch-label-sm">Estado</th>
                <th className="px-4 stitch-label-sm text-right">Total (Q)</th>
                <th className="px-4 stitch-label-sm text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {laserOrders.map((order) => (
                <tr key={order.id} className="h-[52px] border-b border-[#F1F5F9] hover:bg-[#F8FAFC]">
                  <td className="px-4 text-[13px] font-semibold text-[#0F172A] tabular-metrics">
                    {order.order_code}
                  </td>
                  <td className="px-4">
                    <div className="text-[13px] font-medium text-[#0F172A]">{order.client_name}</div>
                    <div className="text-[11px] text-[#64748B] truncate max-w-[260px]">
                      {order.description}
                    </div>
                  </td>
                  <td className="px-4 text-[12px] text-[#475569]">{order.material}</td>
                  <td className="px-4 text-[12px] text-[#475569] tabular-metrics">
                    {formatMinutes(order.estimated_minutes)}
                  </td>
                  <td className="px-4">
                    <StatusPill {...getProductionStatusBadge(order.production_status)} />
                  </td>
                  <td className="px-4 text-right text-[13px] font-medium text-[#0F172A] tabular-metrics">
                    {formatQuetzales(order.total_gtq)}
                  </td>
                  <td className="px-4 text-right">
                    {order.production_status !== 'completado' && (
                      <button
                        type="button"
                        onClick={() => onUpdateOrder(order.id, { production_status: 'completado' })}
                        className="h-7 px-2.5 rounded-md border border-[#A7F3D0] bg-[#ECFDF5] text-[#059669] text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        Completar
                      </button>
                    )}
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
