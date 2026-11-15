import React, { useState } from 'react';
import { Eye, Plus, Search, Trash2, X } from 'lucide-react';
import { formatMinutes, formatProcessLabel, formatQuetzales } from '../../lib/format';
import type { DocTypeFilter, WorkOrder } from '../../types/workshop';
import { QuetzalSwitcher } from '../QuetzalSwitcher';
import { getFinancialStatusBadge, getProductionStatusBadge, StatusPill } from '../StatusPill';

interface WorkOrdersViewProps {
  orders: WorkOrder[];
  docFilter: DocTypeFilter;
  onChangeDocFilter: (next: DocTypeFilter) => void;
  onUpdateOrder: (id: number, payload: Partial<WorkOrder>) => Promise<void>;
  onDeleteOrder: (id: number) => Promise<void>;
  onOpenNewOrder: () => void;
  canDelete: boolean;
  canViewFinancialDetails: boolean;
}

export const WorkOrdersView: React.FC<WorkOrdersViewProps> = ({
  orders,
  docFilter,
  onChangeDocFilter,
  onUpdateOrder,
  onDeleteOrder,
  onOpenNewOrder,
  canDelete,
  canViewFinancialDetails,
}) => {
  const [search, setSearch] = useState('');
  const [processFilter, setProcessFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState<WorkOrder | null>(null);

  const filtered = orders.filter((o) => {
    const matchesDoc = docFilter === 'all' || o.doc_type === docFilter;
    const matchesProc = processFilter === 'all' || o.process_type === processFilter;
    const matchesStatus = statusFilter === 'all' || o.production_status === statusFilter;
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      o.order_code.toLowerCase().includes(q) ||
      o.client_name.toLowerCase().includes(q) ||
      o.client_nit.toLowerCase().includes(q) ||
      o.description.toLowerCase().includes(q) ||
      o.material.toLowerCase().includes(q);
    return matchesDoc && matchesProc && matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <span className="stitch-label-sm">Gestión Integral de Taller</span>
          <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-[#0F172A] leading-8 mt-0.5">
            Órdenes de Producción
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <QuetzalSwitcher value={docFilter} onChange={onChangeDocFilter} />
          <button
            type="button"
            onClick={onOpenNewOrder}
            className="h-9 px-4 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[13px] font-medium inline-flex items-center gap-2 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Crear Orden de Producción
          </button>
        </div>
      </div>

      {/* Filters & Table */}
      <div className="stitch-card overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E2E8F0] flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar orden, cliente, NIT..."
                className="stitch-input pl-8 pr-3 w-64"
              />
            </div>

            <select
              value={processFilter}
              onChange={(e) => setProcessFilter(e.target.value)}
              className="stitch-input px-3"
            >
              <option value="all">Todos los procesos</option>
              <option value="3d_printing">Impresión 3D</option>
              <option value="laser">Corte Láser</option>
              <option value="uv_dtf">Impresión UV DTF</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="stitch-input px-3"
            >
              <option value="all">Todos los estados</option>
              <option value="cola_espera">Cola de Espera</option>
              <option value="calentando">Calentando</option>
              <option value="en_produccion">En Producción</option>
              <option value="completado">Completado</option>
            </select>
          </div>

          <div className="text-[12px] text-[#64748B] tabular-metrics">
            Mostrando <strong className="text-[#0F172A]">{filtered.length}</strong> de {orders.length} órdenes
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F8FAFC] h-10 border-b border-[#E2E8F0]">
                <th className="px-4 stitch-label-sm">Orden / Doc</th>
                <th className="px-4 stitch-label-sm">Cliente / NIT</th>
                <th className="px-4 stitch-label-sm">Proceso</th>
                <th className="px-4 stitch-label-sm">Producción</th>
                {canViewFinancialDetails && (
                  <>
                    <th className="px-4 stitch-label-sm">Pago</th>
                    <th className="px-4 stitch-label-sm text-right">Subtotal (Q)</th>
                    <th className="px-4 stitch-label-sm text-right">IVA (Q)</th>
                    <th className="px-4 stitch-label-sm text-right">Total (Q)</th>
                  </>
                )}
                <th className="px-4 stitch-label-sm text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={canViewFinancialDetails ? 9 : 5} className="px-6 py-12 text-center text-[13px] text-[#64748B]">
                    No se encontraron órdenes con los criterios actuales.
                  </td>
                </tr>
              ) : (
                filtered.map((order) => (
                  <tr key={order.id} className="h-[52px] border-b border-[#F1F5F9] hover:bg-[#F8FAFC]">
                    <td className="px-4 whitespace-nowrap">
                      <div className="text-[13px] font-semibold text-[#0F172A] tabular-metrics">
                        {order.order_code}
                      </div>
                      <div className="text-[11px] text-[#64748B] tabular-metrics">
                        {order.doc_type === 'factura_sat'
                          ? `SAT ${order.sat_series || 'A1B2'}-${order.sat_number || ''}`
                          : 'Comprobante Taller'}
                      </div>
                    </td>
                    <td className="px-4">
                      <div className="text-[13px] font-medium text-[#0F172A] truncate max-w-[200px]">
                        {order.client_name}
                      </div>
                      <div className="text-[11px] text-[#64748B] tabular-metrics">
                        NIT: {order.client_nit} · Entrega {order.due_date}
                      </div>
                    </td>
                    <td className="px-4 whitespace-nowrap">
                      <div className="text-[12px] font-medium text-[#1E293B]">
                        {formatProcessLabel(order.process_type)}
                      </div>
                      <div className="text-[11px] text-[#64748B] tabular-metrics">
                        {order.quantity} pzs · {formatMinutes(order.estimated_minutes)}
                      </div>
                    </td>
                    <td className="px-4">
                      <select
                        value={order.production_status}
                        onChange={(e) =>
                          onUpdateOrder(order.id, {
                            production_status: e.target.value as WorkOrder['production_status'],
                          })
                        }
                        className="h-7 rounded-md border border-[#E2E8F0] bg-white px-2 text-[11px] font-medium text-[#0F172A] focus:outline-none focus:border-[#2563EB]"
                      >
                        <option value="cola_espera">Cola de Espera</option>
                        <option value="calentando">Calentando</option>
                        <option value="en_produccion">En Producción</option>
                        <option value="completado">Completado</option>
                        <option value="mantenimiento">Mantenimiento</option>
                      </select>
                    </td>
                    {canViewFinancialDetails && (
                      <>
                        <td className="px-4">
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateOrder(order.id, {
                                payment_status: order.payment_status === 'cobrado' ? 'pendiente' : 'cobrado',
                              })
                            }
                            title="Alternar estado de cobro"
                            className="cursor-pointer"
                          >
                            <StatusPill {...getFinancialStatusBadge(order.payment_status)} />
                          </button>
                        </td>
                        <td className="px-4 text-right text-[13px] text-[#475569] tabular-metrics whitespace-nowrap">
                          {formatQuetzales(order.subtotal_gtq)}
                        </td>
                        <td className="px-4 text-right text-[13px] text-[#64748B] tabular-metrics whitespace-nowrap">
                          {formatQuetzales(order.iva_gtq)}
                        </td>
                        <td className="px-4 text-right text-[13px] font-semibold text-[#0F172A] tabular-metrics whitespace-nowrap">
                          {formatQuetzales(order.total_gtq)}
                        </td>
                      </>
                    )}
                    <td className="px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setSelectedOrder(order)}
                          title="Ver detalle de orden"
                          className="h-7 w-7 rounded-md border border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] flex items-center justify-center text-[#475569] cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => onDeleteOrder(order.id)}
                            title="Eliminar orden"
                            className="h-7 w-7 rounded-md border border-transparent hover:border-[#FECACA] hover:bg-[#FEF2F2] hover:text-[#DC2626] flex items-center justify-center text-[#94A3B8] cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F172A]/40 backdrop-blur-[4px]">
          <div className="w-full max-w-lg rounded-2xl bg-[#FFFFFF] border border-[#E2E8F0] shadow-[0_20px_25px_-5px_rgba(15,23,42,0.12)] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
              <div>
                <span className="stitch-label-sm">
                  {selectedOrder.doc_type === 'factura_sat'
                    ? `Factura SAT Serie ${selectedOrder.sat_series}-${selectedOrder.sat_number}`
                    : 'Comprobante Interno de Taller'}
                </span>
                <h3 className="text-[18px] font-semibold text-[#0F172A] tabular-metrics mt-0.5">
                  Orden {selectedOrder.order_code}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="h-8 w-8 rounded-lg border border-[#E2E8F0] flex items-center justify-center text-[#64748B] hover:text-[#0F172A] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-[13px]">
              <div className="flex items-center justify-between">
                <StatusPill {...getProductionStatusBadge(selectedOrder.production_status)} />
                {canViewFinancialDetails && <StatusPill {...getFinancialStatusBadge(selectedOrder.payment_status)} />}
              </div>

              <div className="grid grid-cols-2 gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                <div>
                  <div className="stitch-label-sm">Cliente</div>
                  <div className="font-semibold text-[#0F172A] mt-0.5">{selectedOrder.client_name}</div>
                  <div className="text-[12px] text-[#64748B] tabular-metrics">NIT: {selectedOrder.client_nit}</div>
                </div>
                <div>
                  <div className="stitch-label-sm">Producción</div>
                  <div className="font-semibold text-[#0F172A] mt-0.5">
                    {formatProcessLabel(selectedOrder.process_type)}
                  </div>
                  <div className="text-[12px] text-[#64748B] tabular-metrics">
                    Equipo: {selectedOrder.machine_id || 'Por asignar'}
                  </div>
                </div>
              </div>

              <div>
                <div className="stitch-label-sm mb-1">Especificación</div>
                <p className="text-[#1E293B] leading-5">{selectedOrder.description}</p>
                <p className="text-[12px] text-[#64748B] mt-1 tabular-metrics">
                  Material: {selectedOrder.material} · Cantidad: {selectedOrder.quantity} pzs · Tiempo est.:{' '}
                  {formatMinutes(selectedOrder.estimated_minutes)}
                </p>
              </div>

              {canViewFinancialDetails && (
                <div className="border-t border-[#E2E8F0] pt-3 space-y-1.5 tabular-metrics">
                  <div className="flex justify-between text-[#64748B]">
                    <span>Base Imponible</span>
                    <span>{formatQuetzales(selectedOrder.subtotal_gtq)}</span>
                  </div>
                  <div className="flex justify-between text-[#64748B]">
                    <span>IVA (12% SAT)</span>
                    <span>{formatQuetzales(selectedOrder.iva_gtq)}</span>
                  </div>
                  <div className="flex justify-between text-[16px] font-semibold text-[#0F172A] pt-1 border-t border-[#F1F5F9]">
                    <span>Total Quetzales</span>
                    <span>{formatQuetzales(selectedOrder.total_gtq)}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-3.5 bg-[#F8FAFC] border-t border-[#E2E8F0] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="h-9 px-4 rounded-lg bg-[#0F172A] text-white text-[13px] font-medium cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
