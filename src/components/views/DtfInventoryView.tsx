import React, { useState } from 'react';
import { Droplets, Minus, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { formatInventoryCategory, formatQuetzales } from '../../lib/format';
import type { InventoryItem, Machine } from '../../types/workshop';
import { getProductionStatusBadge, StatusPill } from '../StatusPill';

interface DtfInventoryViewProps {
  machines: Machine[];
  items: InventoryItem[];
  onUpdateMachine: (id: string, payload: Partial<Machine>) => Promise<void>;
  onAdjustStock: (id: number, delta: number) => Promise<void>;
  onDeleteItem: (id: number) => Promise<void>;
  onOpenNewItem: () => void;
  canAdminDelete: boolean;
}

export const DtfInventoryView: React.FC<DtfInventoryViewProps> = ({
  machines,
  items,
  onUpdateMachine,
  onAdjustStock,
  onDeleteItem,
  onOpenNewItem,
  canAdminDelete,
}) => {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const dtfMachine = machines.find((m) => m.category === 'uv_dtf');

  const filteredItems = items.filter((item) => {
    const matchesCat = categoryFilter === 'all' || item.category === categoryFilter;
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      item.sku.toLowerCase().includes(q) ||
      item.name.toLowerCase().includes(q) ||
      item.supplier.toLowerCase().includes(q);
    return matchesCat && matchesSearch;
  });

  const handleRefillInks = () => {
    if (!dtfMachine) return;
    onUpdateMachine(dtfMachine.id, {
      telemetry: {
        ...dtfMachine.telemetry,
        ink_c: 100,
        ink_m: 100,
        ink_y: 100,
        ink_k: 100,
        ink_w: 100,
        ink_varnish: 100,
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="stitch-label-sm">Niveles UV DTF e Insumos de Planta</span>
          <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-[#0F172A] leading-8 mt-0.5">
            Inventario UV DTF y Consumibles
          </h2>
        </div>
        <button
          type="button"
          onClick={onOpenNewItem}
          className="h-9 px-4 rounded-lg bg-[#0F172A] hover:bg-[#1E293B] text-white text-[13px] font-medium inline-flex items-center gap-2 cursor-pointer self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          Agregar Insumo
        </button>
      </div>

      {/* UV DTF Ink Telemetry Card */}
      {dtfMachine && (
        <div className="stitch-card p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[#ECFDF5] text-[#059669] flex items-center justify-center">
                <Droplets className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h3 className="text-[16px] font-semibold text-[#0F172A]">{dtfMachine.name}</h3>
                  <StatusPill {...getProductionStatusBadge(dtfMachine.status)} />
                </div>
                <p className="text-[12px] text-[#64748B] tabular-metrics">
                  {dtfMachine.model} · Lámpara UV {dtfMachine.telemetry.lamp_temp_c ?? 41}°C · Trabajo:{' '}
                  {dtfMachine.current_job_code || 'En espera'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRefillInks}
              className="h-8 px-3 rounded-lg border border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] text-[12px] font-medium text-[#0F172A] inline-flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Registrar Recarga 100%
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { key: 'ink_c', name: 'Cyan (C)', val: dtfMachine.telemetry.ink_c ?? 75, color: '#06B6D4' },
              { key: 'ink_m', name: 'Magenta (M)', val: dtfMachine.telemetry.ink_m ?? 64, color: '#EC4899' },
              { key: 'ink_y', name: 'Yellow (Y)', val: dtfMachine.telemetry.ink_y ?? 82, color: '#EAB308' },
              { key: 'ink_k', name: 'Black (K)', val: dtfMachine.telemetry.ink_k ?? 55, color: '#0F172A' },
              { key: 'ink_w', name: 'White (W)', val: dtfMachine.telemetry.ink_w ?? 38, color: '#94A3B8' },
              { key: 'ink_varnish', name: 'Barniz (V)', val: dtfMachine.telemetry.ink_varnish ?? 71, color: '#2563EB' },
            ].map((ch) => (
              <div key={ch.key} className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] font-medium text-[#1E293B]">{ch.name}</span>
                  <span
                    className={`text-[12px] font-semibold tabular-metrics ${
                      ch.val < 40 ? 'text-[#DC2626]' : 'text-[#0F172A]'
                    }`}
                  >
                    {ch.val}%
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-[#E2E8F0] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${ch.val}%`, backgroundColor: ch.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full Materials Inventory Table */}
      <div className="stitch-card overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E2E8F0] flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <span className="stitch-label-sm">Existencias y Valoración</span>
            <h3 className="text-[16px] font-semibold text-[#0F172A]">Catálogo de Materiales</h3>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar SKU, material..."
                className="stitch-input pl-8 pr-3 w-52"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="stitch-input px-3"
            >
              <option value="all">Todas las categorías</option>
              <option value="filamento_3d">Filamento 3D</option>
              <option value="resina_3d">Resina 3D</option>
              <option value="lamina_laser">Plancha Láser</option>
              <option value="tinta_uv_dtf">Tinta UV DTF</option>
              <option value="film_dtf">Film UV DTF</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F8FAFC] h-10 border-b border-[#E2E8F0]">
                <th className="px-4 stitch-label-sm">SKU</th>
                <th className="px-4 stitch-label-sm">Insumo</th>
                <th className="px-4 stitch-label-sm">Categoría</th>
                <th className="px-4 stitch-label-sm">Estado</th>
                <th className="px-4 stitch-label-sm text-right">Stock</th>
                <th className="px-4 stitch-label-sm text-right">Costo Unit. (Q)</th>
                <th className="px-4 stitch-label-sm text-right">Ajuste Rápido</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => {
                const isLow = item.stock_qty <= item.min_stock_qty;
                return (
                  <tr key={item.id} className="h-[52px] border-b border-[#F1F5F9] hover:bg-[#F8FAFC]">
                    <td className="px-4 text-[12px] font-semibold text-[#0F172A] tabular-metrics whitespace-nowrap">
                      {item.sku}
                    </td>
                    <td className="px-4">
                      <div className="text-[13px] font-medium text-[#0F172A]">{item.name}</div>
                      <div className="text-[11px] text-[#64748B]">{item.supplier}</div>
                    </td>
                    <td className="px-4 text-[12px] text-[#475569]">
                      {formatInventoryCategory(item.category)}
                    </td>
                    <td className="px-4">
                      {isLow ? (
                        <StatusPill label="Bajo Mínimo" variant="crimson" />
                      ) : (
                        <StatusPill label="Operativo" variant="emerald" />
                      )}
                    </td>
                    <td className="px-4 text-right text-[13px] font-semibold tabular-metrics whitespace-nowrap">
                      <span className={isLow ? 'text-[#DC2626]' : 'text-[#0F172A]'}>
                        {item.stock_qty} {item.unit}
                      </span>
                      <div className="text-[11px] font-normal text-[#64748B]">
                        mín {item.min_stock_qty} {item.unit}
                      </div>
                    </td>
                    <td className="px-4 text-right text-[13px] text-[#0F172A] tabular-metrics whitespace-nowrap">
                      {formatQuetzales(item.unit_cost_gtq)}
                    </td>
                    <td className="px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onAdjustStock(item.id, -1)}
                          title="Descontar 1 unidad"
                          className="h-7 w-7 rounded-md border border-[#E2E8F0] bg-white hover:bg-[#FEF2F2] hover:text-[#DC2626] flex items-center justify-center text-[#475569] cursor-pointer"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onAdjustStock(item.id, 1)}
                          title="Sumar 1 unidad"
                          className="h-7 w-7 rounded-md border border-[#E2E8F0] bg-white hover:bg-[#ECFDF5] hover:text-[#059669] flex items-center justify-center text-[#475569] cursor-pointer"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                        {canAdminDelete && (
                          <button
                            type="button"
                            onClick={() => onDeleteItem(item.id)}
                            title="Eliminar insumo"
                            className="h-7 w-7 rounded-md border border-transparent hover:border-[#FECACA] hover:bg-[#FEF2F2] hover:text-[#DC2626] flex items-center justify-center text-[#94A3B8] cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
