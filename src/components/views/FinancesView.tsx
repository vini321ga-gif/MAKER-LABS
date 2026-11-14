import React, { useState } from 'react';
import { Check, Download, Plus, Search, Trash2 } from 'lucide-react';
import { formatQuetzales } from '../../lib/format';
import type { DocTypeFilter, FinancesPayload, FinancialEntry } from '../../types/workshop';
import { QuetzalSwitcher } from '../QuetzalSwitcher';
import { getFinancialStatusBadge, StatusPill } from '../StatusPill';

interface FinancesViewProps {
  data: FinancesPayload | null;
  docFilter: DocTypeFilter;
  onChangeDocFilter: (next: DocTypeFilter) => void;
  onUpdateEntry: (id: number, payload: { status?: string }) => Promise<void>;
  onDeleteEntry: (id: number) => Promise<void>;
  onOpenNewEntry: () => void;
  canEdit: boolean;
}

export const FinancesView: React.FC<FinancesViewProps> = ({
  data,
  docFilter,
  onChangeDocFilter,
  onUpdateEntry,
  onDeleteEntry,
  onOpenNewEntry,
  canEdit,
}) => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'ingreso' | 'egreso'>('all');
  const [statusFilter, setStatusFilter] = useState('all');

  if (!data) return null;

  const filteredEntries = data.entries.filter((e) => {
    const matchesDoc = docFilter === 'all' || e.doc_type === docFilter;
    const matchesType = typeFilter === 'all' || e.entry_type === typeFilter;
    const matchesStatus = statusFilter === 'all' || e.status === statusFilter;
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      e.entry_code.toLowerCase().includes(q) ||
      e.counterparty.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q) ||
      e.nit.toLowerCase().includes(q);
    return matchesDoc && matchesType && matchesStatus && matchesSearch;
  });

  const exportCsv = () => {
    const headers = [
      'Codigo',
      'Fecha',
      'Tipo',
      'Regimen',
      'Contraparte',
      'NIT',
      'Categoria',
      'Descripcion',
      'Subtotal_GTQ',
      'IVA_GTQ',
      'Total_GTQ',
      'Estado',
    ];
    const rows = filteredEntries.map((e: FinancialEntry) => [
      e.entry_code,
      e.entry_date,
      e.entry_type,
      e.doc_type,
      `"${e.counterparty.replace(/"/g, '""')}"`,
      e.nit,
      `"${e.category.replace(/"/g, '""')}"`,
      `"${e.description.replace(/"/g, '""')}"`,
      e.subtotal_gtq.toFixed(2),
      e.iva_gtq.toFixed(2),
      e.total_gtq.toFixed(2),
      e.status,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `precisionhub_finanzas_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <span className="stitch-label-sm">Contabilidad en Quetzales & Cumplimiento SAT</span>
          <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-[#0F172A] leading-8 mt-0.5">
            Facturación, P&L y Libro Contable
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <QuetzalSwitcher value={docFilter} onChange={onChangeDocFilter} />
          <button
            type="button"
            onClick={exportCsv}
            className="h-9 px-3.5 rounded-lg border border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] text-[13px] font-medium text-[#0F172A] inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="h-4 w-4 text-[#64748B]" />
            Exportar CSV
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={onOpenNewEntry}
              className="h-9 px-4 rounded-lg bg-[#0F172A] hover:bg-[#1E293B] text-white text-[13px] font-medium inline-flex items-center gap-2 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Registrar Movimiento
            </button>
          )}
        </div>
      </div>

      {/* P&L + SAT IVA Summary Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="stitch-card p-5">
          <span className="stitch-label-sm">Ingresos Cobrados</span>
          <div className="text-[22px] font-semibold text-[#059669] tabular-metrics mt-2">
            {formatQuetzales(data.summary.collectedGtq)}
          </div>
        </div>
        <div className="stitch-card p-5">
          <span className="stitch-label-sm">Por Cobrar</span>
          <div className="text-[22px] font-semibold text-[#D97706] tabular-metrics mt-2">
            {formatQuetzales(data.summary.pendingGtq)}
          </div>
        </div>
        <div className="stitch-card p-5">
          <span className="stitch-label-sm">Egresos Operativos</span>
          <div className="text-[22px] font-semibold text-[#DC2626] tabular-metrics mt-2">
            {formatQuetzales(data.summary.expensesGtq)}
          </div>
        </div>
        <div className="stitch-card p-5">
          <span className="stitch-label-sm">Margen Neto</span>
          <div className="text-[22px] font-semibold text-[#0F172A] tabular-metrics mt-2">
            {formatQuetzales(data.summary.netMarginGtq)}
          </div>
        </div>
        <div className="stitch-card p-5">
          <span className="stitch-label-sm">IVA Neto SAT (12%)</span>
          <div className="text-[22px] font-semibold text-[#2563EB] tabular-metrics mt-2">
            {formatQuetzales(data.summary.ivaNetPayableGtq)}
          </div>
          <div className="text-[11px] text-[#64748B] tabular-metrics mt-0.5">
            Déb {formatQuetzales(data.summary.ivaDebitGtq)} · Créd {formatQuetzales(data.summary.ivaCreditGtq)}
          </div>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="stitch-card overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E2E8F0] flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar factura, NIT, proveedor..."
                className="stitch-input pl-8 pr-3 w-64"
              />
            </div>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'all' | 'ingreso' | 'egreso')}
              className="stitch-input px-3"
            >
              <option value="all">Ingresos y Egresos</option>
              <option value="ingreso">Solo Ingresos</option>
              <option value="egreso">Solo Egresos</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="stitch-input px-3"
            >
              <option value="all">Todos los estados</option>
              <option value="cobrado">Cobrado</option>
              <option value="pendiente">Pendiente</option>
              <option value="egreso">Egreso</option>
            </select>
          </div>

          <div className="text-[12px] text-[#64748B] tabular-metrics">
            {filteredEntries.length} asientos contables
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F8FAFC] h-10 border-b border-[#E2E8F0]">
                <th className="px-4 stitch-label-sm">Código / Fecha</th>
                <th className="px-4 stitch-label-sm">Contraparte / NIT</th>
                <th className="px-4 stitch-label-sm">Categoría / Detalle</th>
                <th className="px-4 stitch-label-sm">Documento</th>
                <th className="px-4 stitch-label-sm">Estado</th>
                <th className="px-4 stitch-label-sm text-right">Base (Q)</th>
                <th className="px-4 stitch-label-sm text-right">IVA (Q)</th>
                <th className="px-4 stitch-label-sm text-right">Total (Q)</th>
                {canEdit && <th className="px-4 stitch-label-sm text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((entry) => (
                <tr key={entry.id} className="h-[52px] border-b border-[#F1F5F9] hover:bg-[#F8FAFC]">
                  <td className="px-4 whitespace-nowrap">
                    <div className="text-[13px] font-semibold text-[#0F172A] tabular-metrics">
                      {entry.entry_code}
                    </div>
                    <div className="text-[11px] text-[#64748B] tabular-metrics">{entry.entry_date}</div>
                  </td>
                  <td className="px-4">
                    <div className="text-[13px] font-medium text-[#0F172A] truncate max-w-[190px]">
                      {entry.counterparty}
                    </div>
                    <div className="text-[11px] text-[#64748B] tabular-metrics">NIT: {entry.nit}</div>
                  </td>
                  <td className="px-4">
                    <div className="text-[12px] font-medium text-[#1E293B]">{entry.category}</div>
                    <div className="text-[11px] text-[#64748B] truncate max-w-[230px]">
                      {entry.description}
                    </div>
                  </td>
                  <td className="px-4 text-[12px] text-[#475569] whitespace-nowrap">
                    {entry.doc_type === 'factura_sat' ? 'Factura SAT' : 'Comprobante'}
                  </td>
                  <td className="px-4">
                    <StatusPill {...getFinancialStatusBadge(entry.status)} />
                  </td>
                  <td className="px-4 text-right text-[13px] text-[#475569] tabular-metrics whitespace-nowrap">
                    {formatQuetzales(entry.subtotal_gtq)}
                  </td>
                  <td className="px-4 text-right text-[13px] text-[#64748B] tabular-metrics whitespace-nowrap">
                    {formatQuetzales(entry.iva_gtq)}
                  </td>
                  <td
                    className={`px-4 text-right text-[13px] font-semibold tabular-metrics whitespace-nowrap ${
                      entry.entry_type === 'egreso' ? 'text-[#DC2626]' : 'text-[#0F172A]'
                    }`}
                  >
                    {entry.entry_type === 'egreso' ? '-' : ''}
                    {formatQuetzales(entry.total_gtq)}
                  </td>
                  {canEdit && (
                    <td className="px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        {entry.status === 'pendiente' && (
                          <button
                            type="button"
                            onClick={() => onUpdateEntry(entry.id, { status: 'cobrado' })}
                            title="Marcar como cobrado"
                            className="h-7 px-2.5 rounded-md bg-[#ECFDF5] border border-[#A7F3D0] text-[#059669] hover:bg-[#D1FAE5] text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Check className="h-3 w-3" />
                            Cobrar
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onDeleteEntry(entry.id)}
                          title="Eliminar asiento"
                          className="h-7 w-7 rounded-md border border-transparent hover:border-[#FECACA] hover:bg-[#FEF2F2] hover:text-[#DC2626] flex items-center justify-center text-[#94A3B8] cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
