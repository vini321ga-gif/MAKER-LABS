import React from 'react';
import { AlertTriangle, ArrowUpRight, CheckCircle2, Plus, TrendingUp } from 'lucide-react';
import { formatProcessLabel, formatQuetzales } from '../../lib/format';
import type {
  DashboardPayload,
  DocTypeFilter,
  Machine,
  NavSection,
  WorkOrder,
} from '../../types/workshop';
import { MachineFleetStrip } from '../MachineFleetStrip';
import { QuetzalSwitcher } from '../QuetzalSwitcher';
import { getFinancialStatusBadge, getProductionStatusBadge, StatusPill } from '../StatusPill';

interface DashboardViewProps {
  data: DashboardPayload | null;
  loading: boolean;
  docFilter: DocTypeFilter;
  onChangeDocFilter: (next: DocTypeFilter) => void;
  onNavigate: (section: NavSection) => void;
  onOpenNewOrder: () => void;
  onQuickMarkPaid: (order: WorkOrder) => void;
  onQuickCompleteOrder: (order: WorkOrder) => void;
  canViewBalances: boolean;
  canViewFinancialDetails: boolean;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  data,
  loading,
  docFilter,
  onChangeDocFilter,
  onNavigate,
  onOpenNewOrder,
  onQuickMarkPaid,
  onQuickCompleteOrder,
  canViewBalances,
  canViewFinancialDetails,
}) => {
  if (loading && !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="stitch-card p-6 h-32 bg-white" />
          ))}
        </div>
        <div className="stitch-card p-6 h-48 bg-white" />
        <div className="stitch-card p-6 h-72 bg-white" />
      </div>
    );
  }

  if (!data) return null;

  const { kpis, machines, recentOrders, lowStockItems } = data;

  const handleSelectMachine = (machine: Machine) => {
    if (machine.category === '3d_printing') onNavigate('printing_3d');
    else if (machine.category === 'laser') onNavigate('laser');
    else onNavigate('uv_dtf');
  };

  return (
    <div className="space-y-6">
      {/* Top Toolbar with Quetzal Financial Switcher + Primary CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="stitch-label-sm">Consola Ejecutiva de Operaciones</span>
          <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-[#0F172A] leading-8 mt-0.5">
            {canViewBalances ? 'Resumen Financiero y Producción' : 'Resumen de Producción'}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <QuetzalSwitcher value={docFilter} onChange={onChangeDocFilter} />
          <button
            type="button"
            onClick={onOpenNewOrder}
            className="h-9 px-4 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[13px] font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Crear Orden de Producción
          </button>
        </div>
      </div>

      {canViewBalances && (
        <>
        {/* 4 Telemetry KPI Tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
          <div className="stitch-card stitch-card-interactive p-6">
            <div className="flex items-center justify-between">
              <span className="stitch-label-sm">Ingresos Cobrados</span>
              <StatusPill label="Ingreso" variant="emerald" />
            </div>
            <div className="mt-3 text-[28px] font-semibold leading-9 tracking-[-0.02em] text-[#0F172A] tabular-metrics">
              {formatQuetzales(kpis.collectedGtq)}
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[12px] text-[#059669] font-medium tabular-metrics">
              <TrendingUp className="h-3.5 w-3.5" />
              <span>+12.4% vs mes anterior</span>
            </div>
          </div>
  
          <div className="stitch-card stitch-card-interactive p-6">
            <div className="flex items-center justify-between">
              <span className="stitch-label-sm">Pendiente de Cobro</span>
              <StatusPill label="Pendiente" variant="amber" />
            </div>
            <div className="mt-3 text-[28px] font-semibold leading-9 tracking-[-0.02em] text-[#0F172A] tabular-metrics">
              {formatQuetzales(kpis.pendingGtq)}
            </div>
            <div className="mt-2 text-[12px] text-[#64748B] tabular-metrics">
              {kpis.activeOrdersCount} órdenes en flujo operativo
            </div>
          </div>
  
          <div className="stitch-card stitch-card-interactive p-6">
            <div className="flex items-center justify-between">
              <span className="stitch-label-sm">Egresos Operativos</span>
              <StatusPill label="Egreso" variant="crimson" />
            </div>
            <div className="mt-3 text-[28px] font-semibold leading-9 tracking-[-0.02em] text-[#0F172A] tabular-metrics">
              {formatQuetzales(kpis.expensesGtq)}
            </div>
            <div className="mt-2 text-[12px] text-[#64748B] tabular-metrics">
              Insumos, energía y calibración
            </div>
          </div>
  
          <div className="stitch-card stitch-card-interactive p-6">
            <div className="flex items-center justify-between">
              <span className="stitch-label-sm">Margen Neto · IVA SAT</span>
              <StatusPill label="Operativo" variant="blue" />
            </div>
            <div className="mt-3 text-[28px] font-semibold leading-9 tracking-[-0.02em] text-[#0F172A] tabular-metrics">
              {formatQuetzales(kpis.netProfitGtq)}
            </div>
            <div className="mt-2 text-[12px] text-[#64748B] tabular-metrics">
              IVA Neto por pagar: <strong className="text-[#0F172A]">{formatQuetzales(kpis.ivaBalanceGtq)}</strong>
            </div>
          </div>
        </div>
        </>
      )}

      {/* Specialized Machine Fleet Status Strip */}
      <MachineFleetStrip machines={machines} onSelectMachine={handleSelectMachine} />

      {/* Main Split: Recent Orders Table (8 cols) + Low Stock & SAT Quick Panel (4 cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-8 stitch-card overflow-hidden">
          <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between gap-4">
            <div>
              <span className="stitch-label-sm">Cola Prioritaria</span>
              <h3 className="text-[16px] font-semibold text-[#0F172A]">
                Órdenes de Producción Recientes
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('orders')}
              className="text-[12px] font-medium text-[#2563EB] hover:text-[#1D4ED8] inline-flex items-center gap-1 cursor-pointer"
            >
              Ver todas <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] h-10 border-b border-[#E2E8F0]">
                  <th className="px-4 stitch-label-sm">Orden</th>
                  <th className="px-4 stitch-label-sm">Cliente / Proceso</th>
                  <th className="px-4 stitch-label-sm">Producción</th>
                  {canViewFinancialDetails && <th className="px-4 stitch-label-sm">Cobro</th>}
                  {canViewFinancialDetails && <th className="px-4 stitch-label-sm text-right">Total (Q)</th>
                  <th className="px-4 stitch-label-sm text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.length === 0 ? (
                  <tr>
                    <td colSpan={canViewFinancialDetails ? 6 : 4} className="px-6 py-10 text-center text-[13px] text-[#64748B]">
                      No hay órdenes registradas para el filtro documental seleccionado.
                    </td>
                  </tr>
                ) : (
                  recentOrders.map((order) => (
                    <tr
                      key={order.id}
                      className="h-[52px] border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors"
                    >
                      <td className="px-4 text-[13px] font-medium text-[#0F172A] tabular-metrics whitespace-nowrap">
                        <div>{order.order_code}</div>
                        <div className="text-[11px] text-[#64748B]">
                          {order.doc_type === 'factura_sat'
                            ? `SAT ${order.sat_series || 'A1B2'}-${order.sat_number || ''}`
                            : 'Comprobante'}
                        </div>
                      </td>
                      <td className="px-4 text-[13px] text-[#1E293B]">
                        <div className="font-medium text-[#0F172A] truncate max-w-[200px]">
                          {order.client_name}
                        </div>
                        <div className="text-[11px] text-[#64748B]">
                          {formatProcessLabel(order.process_type)} · {order.quantity} pzs
                        </div>
                      </td>
                      <td className="px-4">
                        <StatusPill {...getProductionStatusBadge(order.production_status)} />
                      </td>
                      {canViewFinancialDetails && (
                        <>
                          <td className="px-4">
                            <StatusPill {...getFinancialStatusBadge(order.payment_status)} />
                          </td>
                          <td className="px-4 text-right text-[13px] font-medium text-[#0F172A] tabular-metrics whitespace-nowrap">
                            {formatQuetzales(order.total_gtq)}
                          </td>
                        </>
                      )}
                      <td className="px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {order.production_status !== 'completado' && (
                            <button
                              type="button"
                              onClick={() => onQuickCompleteOrder(order)}
                              title="Marcar producción completada"
                              className="h-7 px-2.5 rounded-md border border-[#E2E8F0] bg-white hover:bg-[#ECFDF5] hover:text-[#059669] hover:border-[#A7F3D0] text-[11px] font-medium text-[#0F172A] transition-colors cursor-pointer"
                            >
                              Completar
                            </button>
                          )}
                          {canViewFinancialDetails && order.payment_status === 'pendiente' && (
                            <button
                              type="button"
                              onClick={() => onQuickMarkPaid(order)}
                              className="h-7 px-2.5 rounded-md bg-[#0F172A] hover:bg-[#1E293B] text-white text-[11px] font-medium transition-colors cursor-pointer"
                            >
                              Cobrar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Low Stock Alerts & Quick Navigation */}
        <div className="xl:col-span-4 stitch-card p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="stitch-label-sm">Reposición de Almacén</span>
                <h3 className="text-[16px] font-semibold text-[#0F172A]">
                  Alertas de Stock Mínimo
                </h3>
              </div>
              {lowStockItems.length > 0 ? (
                <StatusPill label={`${lowStockItems.length} Alertas`} variant="crimson" />
              ) : (
                <StatusPill label="Nominal" variant="emerald" />
              )}
            </div>

            {lowStockItems.length === 0 ? (
              <div className="rounded-xl border border-[#A7F3D0] bg-[#ECFDF5] p-4 flex items-center gap-3 text-[13px] text-[#059669]">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <span>Todos los filamentos, planchas láser y tintas UV DTF están sobre el mínimo.</span>
              </div>
            ) : (
              <div className="space-y-3">
                {lowStockItems.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-3.5 flex items-start justify-between gap-3"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <AlertTriangle className="h-4 w-4 text-[#DC2626] mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-[#0F172A] truncate">
                          {item.name}
                        </div>
                        <div className="text-[11px] text-[#64748B] tabular-metrics mt-0.5">
                          SKU {item.sku} · Mínimo {item.min_stock_qty} {item.unit}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 tabular-metrics">
                      <div className="text-[13px] font-semibold text-[#DC2626]">
                        {item.stock_qty} {item.unit}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-[#E2E8F0] flex items-center justify-between">
            <span className="text-[12px] text-[#64748B]">Gestionar consumibles DTF y 3D</span>
            <button
              type="button"
              onClick={() => onNavigate('uv_dtf')}
              className="h-8 px-3 rounded-lg border border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] text-[12px] font-medium text-[#0F172A] cursor-pointer"
            >
              Ir a Inventario
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
