import React, { useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../lib/api';
import { formatQuetzales } from '../lib/format';
import type { FinancialEntry } from '../types/workshop';

interface ExpenseModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (entry: FinancialEntry) => void;
  onError: (msg: string) => void;
}

export const ExpenseModal: React.FC<ExpenseModalProps> = ({ open, onClose, onCreated, onError }) => {
  const [entryType, setEntryType] = useState<'egreso' | 'ingreso'>('egreso');
  const [category, setCategory] = useState('Insumos y Filamentos');
  const [counterparty, setCounterparty] = useState('');
  const [description, setDescription] = useState('');
  const [totalGtq, setTotalGtq] = useState('');
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<'cobrado' | 'pendiente'>('cobrado');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(totalGtq);
    if (!Number.isFinite(amount) || amount <= 0) {
      onError('Ingrese un monto mayor a Q 0.00');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.createFinancialEntry({
        entry_type: entryType,
        doc_type: 'comprobante_taller',
        category,
        description,
        counterparty,
        nit: 'CF',
        total_gtq: amount,
        entry_date: entryDate,
        status: entryType === 'egreso' ? 'egreso' : status,
      });
      onCreated(res.entry);
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Error registrando movimiento');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F172A]/40 backdrop-blur-[4px]">
      <div className="w-full max-w-lg rounded-2xl bg-[#FFFFFF] border border-[#E2E8F0] shadow-[0_20px_25px_-5px_rgba(15,23,42,0.12)] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
          <div>
            <span className="stitch-label-sm">Libro Contable en Quetzales</span>
            <h2 className="text-[18px] font-semibold text-[#0F172A] mt-0.5">
              Registrar Movimiento Financiero
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-lg border border-[#E2E8F0] flex items-center justify-center text-[#64748B] hover:text-[#0F172A] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-[#1E293B] mb-1">Tipo</label>
            <select value={entryType} onChange={(e) => { const t = e.target.value as 'egreso' | 'ingreso'; setEntryType(t); setCategory(t === 'egreso' ? 'Insumos y Filamentos' : 'Servicios Especiales'); }} className="stitch-input w-full px-3">
              <option value="egreso">Egreso / Gasto Operativo</option><option value="ingreso">Ingreso Directo</option>
            </select>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-[#1E293B] mb-1">
                {entryType === 'egreso' ? 'Proveedor *' : 'Cliente *'}
              </label>
              <input
                type="text"
                required
                value={counterparty}
                onChange={(e) => setCounterparty(e.target.value)}
                placeholder="Ej. 3DTech Guatemala S.A."
                className="stitch-input w-full px-3"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-[#1E293B] mb-1">Categoría *</label>
              <input
                type="text"
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="stitch-input w-full px-3"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#1E293B] mb-1">Fecha</label>
              <input
                type="date"
                required
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="stitch-input w-full px-3 tabular-metrics"
              />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#1E293B] mb-1">Descripción *</label>
            <input
              type="text"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej. Compra de 6 bobinas PETG Negro y boquillas 0.4mm"
              className="stitch-input w-full px-3"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-[#1E293B] mb-1">Monto Total (Q) *</label>
              <div className="flex rounded-lg border border-[#CBD5E1] overflow-hidden focus-within:border-[#2563EB] focus-within:ring-2 focus-within:ring-[#2563EB]/15">
                <span className="flex items-center px-3 bg-[#F8FAFC] border-r border-[#E2E8F0] text-[13px] font-medium text-[#64748B]">
                  Q
                </span>
                <input
                  type="number"
                  step="0.01"
                  min={0.01}
                  required
                  value={totalGtq}
                  onChange={(e) => setTotalGtq(e.target.value)}
                  className="h-[36px] w-full px-3 text-[13px] text-[#0F172A] bg-white focus:outline-none tabular-metrics"
                />
              </div>
            </div>
            {entryType === 'ingreso' && (
              <div>
                <label className="block text-[12px] font-medium text-[#1E293B] mb-1">Estado</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'cobrado' | 'pendiente')}
                  className="stitch-input w-full px-3"
                >
                  <option value="cobrado">Cobrado</option>
                  <option value="pendiente">Pendiente</option>
                </select>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3.5 flex items-center justify-between text-[12px] tabular-metrics">
            <span className="text-[#64748B]">Monto final registrado</span>
            <span className="text-[15px] font-semibold text-[#0F172A]">{formatQuetzales(Number(totalGtq) || 0)}</span>
          </div>

          <div className="flex justify-end gap-2.5 pt-2 border-t border-[#E2E8F0]">
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
              className="h-9 px-4 rounded-lg bg-[#0F172A] hover:bg-[#1E293B] disabled:opacity-60 text-[13px] font-medium text-white cursor-pointer"
            >
              {submitting ? 'Guardando...' : 'Registrar Movimiento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
