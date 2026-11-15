import React, { useState } from 'react';
import { Check, Download, Paperclip, Plus, Search, Trash2, Upload } from 'lucide-react';
import { api } from '../../lib/api';
import { formatQuetzales } from '../../lib/format';
import type { DocTypeFilter, FinancesPayload, FinancialAttachment, FinancialEntry } from '../../types/workshop';
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
  canDelete: boolean;
  canCreate: boolean;
  canViewBalances: boolean;
}

export const FinancesView: React.FC<FinancesViewProps> = ({
  data,
  docFilter,
  onChangeDocFilter,
  onUpdateEntry,
  onDeleteEntry,
  onOpenNewEntry,
  canEdit,
  canDelete,
  canCreate,
  canViewBalances,
}) => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'ingreso' | 'egreso'>('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedAttachments, setExpandedAttachments] = useState<number | null>(null);
  const [attachments, setAttachments] = useState<Record<number, FinancialAttachment[]>>({});
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [attachmentBusy, setAttachmentBusy] = useState(false);

  const loadAttachments = async (entryId: number) => {
    setAttachmentBusy(true);
    setAttachmentError(null);
    try {
      const result = await api.getFinancialAttachments(entryId);
      setAttachments((current) => ({ ...current, [entryId]: result.attachments }));
    } catch (err) {
      setAttachmentError(err instanceof Error ? err.message : 'Error leyendo adjuntos');
    } finally {
      setAttachmentBusy(false);
    }
  };

  const toggleAttachments = async (entryId: number) => {
    setAttachmentError(null);
    if (expandedAttachments === entryId) {
      setExpandedAttachments(null);
      return;
    }
    setExpandedAttachments(entryId);
    await loadAttachments(entryId);
  };

  const uploadAttachment = async (entryId: number, file?: File) => {
    if (!file) return;
    setAttachmentBusy(true);
    setAttachmentError(null);
    try {
      await api.uploadFinancialAttachment(entryId, file);
      await loadAttachments(entryId);
    } catch (err) {
      setAttachmentError(err instanceof Error ? err.message : 'Error subiendo archivo');
    } finally {
      setAttachmentBusy(false);
    }
  };

  const removeAttachment = async (entryId: number, attachmentId: string) => {
    setAttachmentBusy(true);
    setAttachmentError(null);
    try {
      await api.deleteFinancialAttachment(entryId, attachmentId);
      await loadAttachments(entryId);
    } catch (err) {
      setAttachmentError(err instanceof Error ? err.message : 'Error eliminando archivo');
    } finally {
      setAttachmentBusy(false);
    }
  };

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
      e.category.toLowerCase().includes(q);
    return matchesDoc && matchesType && matchesStatus && matchesSearch;
  });

  const exportCsv = () => {
    const headers = [
      'Codigo',
      'Fecha',
      'Tipo',
      'Contraparte',
      'Categoria',
      'Descripcion',
      'Total_GTQ',
      'Estado',
    ];
    const rows = filteredEntries.map((e: FinancialEntry) => [
      e.entry_code,
      e.entry_date,
      e.entry_type,
      `"${e.counterparty.replace(/"/g, '""')}"`,
      `"${e.category.replace(/"/g, '""')}"`,
      `"${e.description.replace(/"/g, '""')}"`,
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
          <span className="stitch-label-sm">Control de Ingresos y Egresos</span>
          <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-[#0F172A] leading-8 mt-0.5">
            Ingresos, Egresos y Libro Contable
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
          {canCreate && (
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

      {canViewBalances && data.summary && (
        <>
        {/* Resumen financiero */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
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
        </div>
        </>
      )}

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
                placeholder="Buscar código, cliente o proveedor..."
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
                <th className="px-4 stitch-label-sm">Contraparte</th>
                <th className="px-4 stitch-label-sm">Categoría / Detalle</th>
                <th className="px-4 stitch-label-sm">Estado</th>
                <th className="px-4 stitch-label-sm text-right">Total (Q)</th>
                <th className="px-4 stitch-label-sm">Registrado por</th>
                {canEdit && <th className="px-4 stitch-label-sm text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((entry) => (
                <React.Fragment key={entry.id}>
                <tr className="h-[52px] border-b border-[#F1F5F9] hover:bg-[#F8FAFC]">
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
                  </td>
                  <td className="px-4">
                    <div className="text-[12px] font-medium text-[#1E293B]">{entry.category}</div>
                    <div className="text-[11px] text-[#64748B] truncate max-w-[230px]">
                      {entry.description}
                    </div>
                  </td>
                  <td className="px-4">
                    <StatusPill {...getFinancialStatusBadge(entry.status)} />
                  </td>
                  <td
                    className={`px-4 text-right text-[13px] font-semibold tabular-metrics whitespace-nowrap ${
                      entry.entry_type === 'egreso' ? 'text-[#DC2626]' : 'text-[#0F172A]'
                    }`}
                  >
                    {entry.entry_type === 'egreso' ? '-' : ''}
                    {formatQuetzales(entry.total_gtq)}
                  </td>
                  <td className="px-4 text-[12px] text-[#475569] whitespace-nowrap">{entry.created_by_name || 'Usuario no disponible'}</td>
                  {canEdit && (
                    <td className="px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void toggleAttachments(entry.id)}
                          title="Ver documentos adjuntos"
                          aria-label={`Ver documentos adjuntos de ${entry.entry_code}`}
                          className="h-7 w-7 rounded-md border border-transparent hover:border-[#CBD5E1] hover:bg-[#F8FAFC] flex items-center justify-center text-[#64748B] cursor-pointer"
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                        </button>
                        {entry.status === 'pendiente' && !entry.order_code && (
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
                        {canDelete && (
                        <button
                          type="button"
                          onClick={() => onDeleteEntry(entry.id)}
                          title="Eliminar asiento"
                          className="h-7 w-7 rounded-md border border-transparent hover:border-[#FECACA] hover:bg-[#FEF2F2] hover:text-[#DC2626] flex items-center justify-center text-[#94A3B8] cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
                {expandedAttachments === entry.id && (
                  <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                    <td colSpan={canEdit ? 7 : 6} className="px-5 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-[12px] text-[#475569]">
                          <span className="font-medium text-[#0F172A]">Documentos de {entry.entry_code}</span>
                          <span className="ml-2">{attachments[entry.id]?.length ?? 0} archivos</span>
                        </div>
                        {canEdit && (
                          <label className="h-7 px-2.5 rounded-md border border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] text-[11px] font-medium text-[#334155] inline-flex items-center gap-1.5 cursor-pointer">
                            <Upload className="h-3 w-3" />
                            Adjuntar archivo
                            <input
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                              className="hidden"
                              disabled={attachmentBusy}
                              onChange={(event) => {
                                const file = event.currentTarget.files?.[0];
                                event.currentTarget.value = '';
                                void uploadAttachment(entry.id, file);
                              }}
                            />
                          </label>
                        )}
                      </div>
                      {attachmentError && <div role="alert" className="mt-2 text-[11px] text-[#DC2626]">{attachmentError}</div>}
                      {attachmentBusy && <div className="mt-2 text-[11px] text-[#64748B]">Procesando archivo...</div>}
                      {!attachmentBusy && !attachments[entry.id]?.length && (
                        <div className="mt-2 text-[11px] text-[#64748B]">Aún no hay documentos adjuntos.</div>
                      )}
                      {!!attachments[entry.id]?.length && (
                        <ul className="mt-2 space-y-1">
                          {attachments[entry.id].map((attachment) => (
                            <li key={attachment.id} className="flex items-center justify-between gap-3 text-[11px]">
                              <a
                                href={`/api/finances/${entry.id}/attachments/${encodeURIComponent(attachment.id)}`}
                                className="truncate text-[#2563EB] hover:underline"
                                download={attachment.original_name}
                              >
                                {attachment.original_name}
                              </a>
                              {canDelete && (
                                <button
                                  type="button"
                                  onClick={() => void removeAttachment(entry.id, attachment.id)}
                                  title="Eliminar adjunto"
                                  className="h-6 w-6 flex items-center justify-center text-[#94A3B8] hover:text-[#DC2626] cursor-pointer"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
