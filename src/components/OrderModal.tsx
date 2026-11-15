import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../lib/api';
import { formatQuetzales } from '../lib/format';
import type { Machine, MachineCategory, WorkOrder } from '../types/workshop';

interface OrderModalProps {
  open: boolean;
  machines: Machine[];
  initialProcess?: MachineCategory;
  onClose: () => void;
  onCreated: (order: WorkOrder) => void;
  onError: (msg: string) => void;
}

export const OrderModal: React.FC<OrderModalProps> = ({
  open,
  machines,
  initialProcess = '3d_printing',
  onClose,
  onCreated,
  onError,
}) => {
  const [clientName, setClientName] = useState('');
  const [clientNit, setClientNit] = useState('CF');
  const [processType, setProcessType] = useState<MachineCategory>(initialProcess);
  const [machineId, setMachineId] = useState<string>('');
  const [material, setMaterial] = useState('PETG Carbon Fiber Negro');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('');
  const [estimatedMinutes, setEstimatedMinutes] = useState('');
  const [unitPriceGtq, setUnitPriceGtq] = useState('');
  const [initialPaymentType, setInitialPaymentType] = useState<'none' | 'advance' | 'full'>('none');
  const [initialPaymentStatus, setInitialPaymentStatus] = useState<'pendiente' | 'cobrado'>('pendiente');
  const [initialPaymentAmount, setInitialPaymentAmount] = useState('');
  const [productionStatus, setProductionStatus] = useState<'cola_espera' | 'en_produccion' | 'calentando'>('cola_espera');
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().slice(0, 10);
  });
  const [submitting, setSubmitting] = useState(false);

  const filteredMachines = useMemo(
    () => machines.filter((m) => m.category === processType),
    [machines, processType]
  );

  const selectedMachineId =
    machineId && filteredMachines.some((m) => m.id === machineId)
      ? machineId
      : filteredMachines[0]?.id || '';

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const quantityValue = Number(quantity);
    const estimatedMinutesValue = Number(estimatedMinutes);
    const unitPriceValue = Number(unitPriceGtq);
    const paymentAmountValue = Number(initialPaymentAmount);
    if (!Number.isFinite(quantityValue) || quantityValue < 1 || !Number.isInteger(quantityValue)) {
      onError('Ingrese una cantidad válida de al menos 1 pieza');
      return;
    }
    if (!Number.isFinite(estimatedMinutesValue) || estimatedMinutesValue < 5) {
      onError('Ingrese un tiempo estimado de al menos 5 minutos');
      return;
    }
    if (!Number.isFinite(unitPriceValue) || unitPriceValue <= 0) {
      onError('Ingrese un precio unitario mayor a Q 0.00');
      return;
    }
    if (initialPaymentType === 'advance' && (!Number.isFinite(paymentAmountValue) || paymentAmountValue <= 0 || paymentAmountValue > quantityValue * unitPriceValue)) {
      onError('El anticipo debe ser mayor a Q 0.00 y no superar el total de la orden');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.createOrder({
        client_name: clientName,
        client_nit: clientNit,
        process_type: processType,
        machine_id: selectedMachineId || null,
        material,
        description,
        quantity: quantityValue,
        estimated_minutes: estimatedMinutesValue,
        unit_price_gtq: unitPriceValue,
        doc_type: 'comprobante_taller',
        payment_status: initialPaymentType === 'full' && initialPaymentStatus === 'cobrado' ? 'cobrado' : 'pendiente',
        initial_payment_type: initialPaymentType,
        initial_payment_status: initialPaymentStatus,
        initial_payment_amount: initialPaymentType === 'advance' ? paymentAmountValue : undefined,
        production_status: productionStatus,
        due_date: dueDate,
      });
      onCreated(res.order);
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Error al crear la orden');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F172A]/40 backdrop-blur-[4px]">
      <div className="w-full max-w-2xl rounded-2xl bg-[#FFFFFF] border border-[#E2E8F0] shadow-[0_20px_25px_-5px_rgba(15,23,42,0.12)] overflow-hidden max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
          <div>
            <span className="stitch-label-sm">Nueva Orden de Manufactura</span>
            <h2 className="text-[18px] font-semibold text-[#0F172A] mt-0.5">
              Crear Orden de Producción
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-lg border border-[#E2E8F0] flex items-center justify-center text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-[#1E293B] mb-1">Cliente / Empresa *</label>
            <input type="text" required value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Ej. Ingeniería Industrial S.A." className="stitch-input w-full px-3" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-medium text-[#1E293B] mb-1">
                Proceso de Manufactura
              </label>
              <select
                value={processType}
                onChange={(e) => {
                  const next = e.target.value as MachineCategory;
                  setProcessType(next);
                  if (next === '3d_printing') setMaterial('PETG Carbon Fiber Negro');
                  if (next === 'laser') setMaterial('Acrílico Negro Mate 3mm');
                  if (next === 'uv_dtf') setMaterial('Film UV DTF AB + Barniz');
                }}
                className="stitch-input w-full px-3"
              >
                <option value="3d_printing">Impresión 3D (FDM / SLA)</option>
                <option value="laser">Corte y Grabado Láser</option>
                <option value="uv_dtf">Impresión UV DTF</option>
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#1E293B] mb-1">
                Equipo Asignado
              </label>
              <select
                value={selectedMachineId}
                onChange={(e) => setMachineId(e.target.value)}
                className="stitch-input w-full px-3"
              >
                {filteredMachines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.id})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-medium text-[#1E293B] mb-1">
                Material / Sustrato *
              </label>
              <input
                type="text"
                required
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                className="stitch-input w-full px-3"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#1E293B] mb-1">
                Fecha de Entrega
              </label>
              <input
                type="date"
                required
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="stitch-input w-full px-3 tabular-metrics"
              />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#1E293B] mb-1">
              Especificación Técnica del Trabajo *
            </label>
            <input
              type="text"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej. 20 carcasas sensor industrial, relleno 40%, tolerancia ±0.2mm"
              className="stitch-input w-full px-3"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-[12px] font-medium text-[#1E293B] mb-1">
                Cantidad (piezas)
              </label>
              <input
                type="number"
                min={1}
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="stitch-input w-full px-3 tabular-metrics"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#1E293B] mb-1">
                Precio Unitario (Q)
              </label>
              <div className="flex rounded-lg border border-[#CBD5E1] overflow-hidden focus-within:border-[#2563EB] focus-within:ring-2 focus-within:ring-[#2563EB]/15">
                <span className="flex items-center px-3 bg-[#F8FAFC] border-r border-[#E2E8F0] text-[13px] font-medium text-[#64748B] tabular-metrics">
                  Q
                </span>
                <input
                  type="number"
                  step="0.01"
                  min={0.01}
                  required
                  value={unitPriceGtq}
                  onChange={(e) => setUnitPriceGtq(e.target.value)}
                  className="h-[36px] w-full px-3 text-[13px] text-[#0F172A] bg-white focus:outline-none tabular-metrics"
                />
              </div>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#1E293B] mb-1">
                Tiempo Est. (min)
              </label>
              <input
                type="number"
                min={5}
                required
                value={estimatedMinutes}
                onChange={(e) => setEstimatedMinutes(e.target.value)}
                className="stitch-input w-full px-3 tabular-metrics"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-[12px] font-medium text-[#1E293B] mb-1">Estado de Producción</label>
              <select value={productionStatus} onChange={(e) => setProductionStatus(e.target.value as 'cola_espera' | 'en_produccion' | 'calentando')} className="stitch-input w-full px-3">
                <option value="cola_espera">Cola de Espera</option><option value="calentando">Calentando</option><option value="en_produccion">En Producción</option>
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#1E293B] mb-1">Forma de pago</label>
              <select value={initialPaymentType} onChange={(e) => setInitialPaymentType(e.target.value as 'none' | 'advance' | 'full')} className="stitch-input w-full px-3">
                <option value="none">Pendiente</option><option value="advance">Anticipo</option><option value="full">Pago total</option>
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#1E293B] mb-1">Estado del pago</label>
              <select value={initialPaymentStatus} disabled={initialPaymentType === 'none'} onChange={(e) => setInitialPaymentStatus(e.target.value as 'pendiente' | 'cobrado')} className="stitch-input w-full px-3 disabled:opacity-60">
                <option value="pendiente">Pendiente</option><option value="cobrado">Pagado</option>
              </select>
            </div>
          </div>
          {initialPaymentType === 'advance' && (
            <div className="max-w-sm">
              <label className="block text-[12px] font-medium text-[#1E293B] mb-1">Monto del anticipo (Q)</label>
              <input type="number" step="0.01" min="0.01" max={quantity && unitPriceGtq ? Number(quantity) * Number(unitPriceGtq) : undefined} required value={initialPaymentAmount} onChange={(e) => setInitialPaymentAmount(e.target.value)} className="stitch-input w-full px-3 tabular-metrics" />
            </div>
          )}
          <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 flex items-center justify-between gap-4">
            <span className="text-[12px] text-[#64748B]">Monto final de la orden · 5% incluido</span>
            <div className="text-right"><div className="stitch-label-sm">Total Orden</div><div className="text-[22px] font-semibold text-[#0F172A] tabular-metrics">{formatQuetzales((Number(quantity) || 0) * (Number(unitPriceGtq) || 0))}</div></div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#E2E8F0]">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 rounded-lg border border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] text-[13px] font-medium text-[#0F172A] cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="h-9 px-4 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-[13px] font-medium text-white cursor-pointer"
            >
              {submitting ? 'Registrando...' : 'Guardar Orden'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
