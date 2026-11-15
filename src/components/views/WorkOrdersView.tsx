import React, { useState } from 'react';
import { api } from '../../lib/api';
import { Eye, Plus, Search, Trash2, X } from 'lucide-react';
import { formatMinutes, formatProcessLabel, formatQuetzales } from '../../lib/format';
import type { DocTypeFilter, WorkOrder } from '../../types/workshop';
import { QuetzalSwitcher } from '../QuetzalSwitcher';
import { getFinancialStatusBadge, getProductionStatusBadge, StatusPill } from '../StatusPill';

interface WorkOrdersViewProps {
  orders: WorkOrder[];
  deletedOrders: WorkOrder[];
  docFilter: DocTypeFilter;
  onChangeDocFilter: (next: DocTypeFilter) => void;
  onUpdateOrder: (id: number, payload: Partial<WorkOrder>) => Promise<void>;
  onRegisterOrderPayment: (id: number, payload: { type: 'advance' | 'full'; status: 'pendiente' | 'cobrado'; amount?: number }) => Promise<unknown>;
  onDeleteOrder: (id: number) => Promise<void>;
  onOpenNewOrder: () => void;
  canDelete: boolean;
  canViewFinancialDetails: boolean;
}

export const WorkOrdersView: React.FC<WorkOrdersViewProps> = ({
  orders,
  deletedOrders,
  docFilter,
  onChangeDocFilter,
  onUpdateOrder,
  onRegisterOrderPayment,
  onDeleteOrder,
  onOpenNewOrder,
  canDelete,
  canViewFinancialDetails,
}) => {
  const [search, setSearch] = useState('');
  const [processFilter, setProcessFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState<WorkOrder | null>(null);
  const [paymentType, setPaymentType] = useState<'advance' | 'full'>('advance');
  const [paymentStatus, setPaymentStatus] = useState<'pendiente' | 'cobrado'>('cobrado');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);

  const visibleOrders = showDeleted ? [...orders, ...deletedOrders] : orders;
  const filtered = visibleOrders.filter((o) => {
    const matchesDoc = docFilter === 'all' || o.doc_type === docFilter;
    const matchesProc = processFilter === 'all' || o.process_type === processFilter;
    const matchesStatus = statusFilter === 'all' || o.production_status === statusFilter;
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      o.order_code.toLowerCase().includes(q) ||
      o.client_name.toLowerCase().includes(q) ||
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
          {deletedOrders.length > 0 && (
            <button
              type="button"
              onClick={() => setShowDeleted((value) => !value)}
              className="h-9 px-3 rounded-lg border border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] text-[13px] font-medium text-[#475569] cursor-pointer"
            >
              {showDeleted ? 'Ocultar borradas' : 'Ver borradas'}
            </button>
          )}
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
                <th className="px-4 stitch-label-sm">Orden</th>
                <th className="px-4 stitch-label-sm">Cliente</th>
                <th className="px-4 stitch-label-sm">Proceso</th>
                <th className="px-4 stitch-label-sm">Creada por</th>
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
                  <td colSpan={canViewFinancialDetails ? 8 : 6} className="px-6 py-12 text-center text-[13px] text-[#64748B]">
                    No se encontraron órdenes con los criterios actuales.
                  </td>
                </tr>
              ) : (
                filtered.map((order) => (
                  <tr key={order.id} className={`h-[52px] border-b border-[#F1F5F9] hover:bg-[#F8FAFC] ${order.deleted_at ? 'bg-[#FFF7ED]' : ''}`}>
                    <td className="px-4 whitespace-nowrap">
                      <div className="text-[13px] font-semibold text-[#0F172A] tabular-metrics">
                        {order.order_code}
                      </div>

                    </td>
                    <td className="px-4">
                      <div className="text-[13px] font-medium text-[#0F172A] truncate max-w-[200px]">
                        {order.client_name}
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
                    <td className="px-4 text-[12px] text-[#475569] whitespace-nowrap">{order.created_by_name || 'Usuario no disponible'}</td>
                    <td className="px-4">
                      {order.deleted_at ? (
                        <div>
                          <div className="text-[12px] font-semibold text-[#B45309]">Borrada</div>
                          <div className="text-[11px] text-[#64748B]">Por {order.deleted_by_name || 'Administrador'} · {order.deleted_at}</div>
                        </div>
                      ) : (
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
                      )}
                    </td>
                    {canViewFinancialDetails && (
                      <>
                        <td className="px-4"><StatusPill {...getFinancialStatusBadge(order.payment_status)} /></td>
                        <td className="px-4 text-right text-[13px] font-semibold text-[#0F172A] tabular-metrics whitespace-nowrap">{formatQuetzales(order.total_gtq)}</td>
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
                        {canDelete && !order.deleted_at && (
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
                <span className="stitch-label-sm">Detalle de orden</span>
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
                <div className="border-t border-[#E2E8F0] pt-3 flex justify-between text-[16px] font-semibold text-[#0F172A] tabular-metrics">
                  <span>Total</span><span>{formatQuetzales(selectedOrder.total_gtq)}</span>
                </div>
              )}
              {!selectedOrder.deleted_at && selectedOrder.payment_status !== 'cobrado' && (
                <form onSubmit={async (event) => {
                  event.preventDefault();
                  setPaymentError('');
                  const amount = Number(paymentAmount);
                  if (paymentType === 'advance' && (!Number.isFinite(amount) || amount <= 0)) {
                    setPaymentError('Ingrese un anticipo mayor a Q 0.00');
                    return;
                  }
                  setPaymentBusy(true);
                  try {
                    await onRegisterOrderPayment(selectedOrder.id, {
                      type: paymentType,
                      status: paymentStatus,
                      ...(paymentType === 'advance' ? { amount } : {}),
                    });
                    setSelectedOrder(null);
                    setPaymentAmount('');
                  } catch (error) {
                    setPaymentError(error instanceof Error ? error.message : 'No se pudo registrar el pago');
                  } finally {
                    setPaymentBusy(false);
                  }
                }} className="border-t border-[#E2E8F0] pt-4 space-y-3">
                  <div className="font-semibold text-[#0F172A]">Registrar pago de la orden</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="text-[12px] font-medium text-[#1E293B]">Tipo de pago
                      <select value={paymentType} onChange={(e) => setPaymentType(e.target.value as 'advance' | 'full')} className="stitch-input w-full px-3 mt-1">
                        <option value="advance">Anticipo</option><option value="full">Pago total</option>
                      </select>
                    </label>
                    <label className="text-[12px] font-medium text-[#1E293B]">Estado
                      <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as 'pendiente' | 'cobrado')} className="stitch-input w-full px-3 mt-1">
                        <option value="pendiente">Pendiente</option><option value="cobrado">Pagado</option>
                      </select>
                    </label>
                  </div>
                  {paymentType === 'advance' && (
                    <label className="block text-[12px] font-medium text-[#1E293B]">Monto del anticipo (Q)
                      <input type="number" step="0.01" min="0.01" required value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className="stitch-input w-full px-3 mt-1 tabular-metrics" />
                    </label>
                  )}
                  {paymentError && <div role="alert" className="text-[12px] text-[#DC2626]">{paymentError}</div>}
                  <button type="submit" disabled={paymentBusy} className="h-9 px-4 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-[13px] font-medium text-white cursor-pointer">
                    {paymentBusy ? 'Registrando...' : paymentType === 'advance' ? 'Registrar anticipo' : 'Registrar pago total'}
                  </button>
                </form>
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
