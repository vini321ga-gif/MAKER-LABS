import React, { useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../lib/api';
import type { InventoryCategory, InventoryItem } from '../types/workshop';

interface InventoryModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (item: InventoryItem) => void;
  onError: (msg: string) => void;
}

export const InventoryModal: React.FC<InventoryModalProps> = ({ open, onClose, onCreated, onError }) => {
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<InventoryCategory>('filamento_3d');
  const [unit, setUnit] = useState('kg');
  const [stockQty, setStockQty] = useState('');
  const [minStockQty, setMinStockQty] = useState('');
  const [unitCostGtq, setUnitCostGtq] = useState('');
  const [supplier, setSupplier] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const stock = Number(stockQty);
    const minStock = Number(minStockQty);
    const unitCost = Number(unitCostGtq);
    if (![stock, minStock, unitCost].every((value) => Number.isFinite(value) && value >= 0)) {
      onError('Ingrese valores numéricos válidos para existencias, mínimo y costo');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.createInventoryItem({
        sku,
        name,
        category,
        unit,
        stock_qty: stock,
        min_stock_qty: minStock,
        unit_cost_gtq: unitCost,
        supplier,
      });
      onCreated(res.item);
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Error agregando insumo');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F172A]/40 backdrop-blur-[4px]">
      <div className="w-full max-w-lg rounded-2xl bg-[#FFFFFF] border border-[#E2E8F0] shadow-[0_20px_25px_-5px_rgba(15,23,42,0.12)] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
          <div>
            <span className="stitch-label-sm">Control de Almacén Técnico</span>
            <h2 className="text-[18px] font-semibold text-[#0F172A] mt-0.5">Agregar Insumo / Material</h2>
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-[#1E293B] mb-1">SKU *</label>
              <input
                type="text"
                required
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="FIL-TPU-95A"
                className="stitch-input w-full px-3 uppercase tabular-metrics"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[12px] font-medium text-[#1E293B] mb-1">Categoría</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as InventoryCategory)}
                className="stitch-input w-full px-3"
              >
                <option value="filamento_3d">Filamento 3D</option>
                <option value="resina_3d">Resina 3D</option>
                <option value="lamina_laser">Plancha / Lámina Láser</option>
                <option value="tinta_uv_dtf">Tinta UV DTF</option>
                <option value="film_dtf">Film UV DTF</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#1E293B] mb-1">Nombre del Insumo *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Filamento TPU 95A Negro 1kg"
              className="stitch-input w-full px-3"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-[#1E293B] mb-1">Unidad</label>
              <input
                type="text"
                required
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="kg / L / ml"
                className="stitch-input w-full px-3"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#1E293B] mb-1">Stock</label>
              <input
                type="number"
                step="0.1"
                min={0}
                required
                value={stockQty}
                onChange={(e) => setStockQty(e.target.value)}
                className="stitch-input w-full px-3 tabular-metrics"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#1E293B] mb-1">Mínimo</label>
              <input
                type="number"
                step="0.1"
                min={0}
                required
                value={minStockQty}
                onChange={(e) => setMinStockQty(e.target.value)}
                className="stitch-input w-full px-3 tabular-metrics"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#1E293B] mb-1">Costo (Q)</label>
              <input
                type="number"
                step="0.01"
                min={0}
                required
                value={unitCostGtq}
                onChange={(e) => setUnitCostGtq(e.target.value)}
                className="stitch-input w-full px-3 tabular-metrics"
              />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-[#1E293B] mb-1">Proveedor *</label>
            <input
              type="text"
              required
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="Ej. SignSupply GT"
              className="stitch-input w-full px-3"
            />
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
              {submitting ? 'Guardando...' : 'Agregar Insumo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
