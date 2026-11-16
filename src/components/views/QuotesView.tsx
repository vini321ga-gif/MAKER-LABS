import React, { useRef, useState } from 'react';
import { FileText, Plus, Printer, RotateCcw, Trash2 } from 'lucide-react';
import { formatQuetzales } from '../../lib/format';

interface QuoteLineDraft {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

interface QuoteDraft {
  clientName: string;
  items: QuoteLineDraft[];
  terms: string;
}

interface QuoteLine {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface GeneratedQuote {
  quoteNumber: string;
  date: string;
  clientName: string;
  items: QuoteLine[];
  total: number;
  terms: string;
}

const createEmptyLine = (): QuoteLineDraft => ({
  id: Math.random().toString(36).slice(2),
  description: '',
  quantity: '',
  unitPrice: '',
});

const createEmptyDraft = (): QuoteDraft => ({
  clientName: '',
  items: [createEmptyLine()],
  terms: '',
});

export const QuotesView: React.FC = () => {
  const defaultDocumentTitle = useRef(document.title);
  const [draft, setDraft] = useState<QuoteDraft>(createEmptyDraft);
  const [quote, setQuote] = useState<GeneratedQuote | null>(null);

  const items = draft.items.map((item) => {
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    const lineTotal = Number.isFinite(quantity * unitPrice)
      ? Math.round(quantity * unitPrice * 100) / 100
      : 0;

    return {
      description: item.description.trim(),
      quantity,
      unitPrice,
      total: lineTotal,
    };
  });

  const total = Math.round(items.reduce((sum, item) => sum + item.total, 0) * 100) / 100;

  const updateClientName = (value: string) => {
    setDraft((current) => ({ ...current, clientName: value }));
  };

  const updateLine = (id: string, field: keyof Omit<QuoteLineDraft, 'id'>, value: string) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    }));
  };

  const addLine = () => {
    setDraft((current) => ({ ...current, items: [...current.items, createEmptyLine()] }));
  };

  const removeLine = (id: string) => {
    setDraft((current) => ({
      ...current,
      items: current.items.length > 1 ? current.items.filter((item) => item.id !== id) : current.items,
    }));
  };

  const handleGenerate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const now = new Date();
    const clientName = draft.clientName.trim();
    const safeClientName = clientName.replace(/[<>:"\/\\|?*]/g, '-').replace(/\s+/g, ' ').trim();
    document.title = `Cotización Maker Labs - ${safeClientName || 'Cliente'}`;
    const quoteNumber = 'COT-' + now.getFullYear() + '-' + String(now.getTime()).slice(-6);
    setQuote({
      quoteNumber,
      date: new Intl.DateTimeFormat('es-GT', { dateStyle: 'long' }).format(now),
      clientName,
      items,
      total,
      terms: draft.terms.trim(),
    });
  };

  const resetQuote = () => {
    document.title = defaultDocumentTitle.current;
    setDraft(createEmptyDraft());
    setQuote(null);
  };

  const handlePrint = () => {
    if (!quote) return;

    const originalTitle = document.title;
    const clientName = quote.clientName
      .replace(/[<>:"\/\\|?*]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();

    document.title = `Cotización - ${clientName || 'Cliente'} - Maker Labs`;

    const restoreTitle = () => {
      document.title = originalTitle;
      window.removeEventListener('afterprint', restoreTitle);
    };

    window.addEventListener('afterprint', restoreTitle);
    window.requestAnimationFrame(() => window.print());
  };

  return (
    <div className="space-y-6">
      <div className="quote-no-print flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="stitch-label-sm">Maker Labs</span>
          <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-[#0F172A] leading-8 mt-0.5">
            Generador de cotizaciones
          </h2>
          <p className="text-[13px] text-[#64748B] mt-1">
            Completa los datos del cliente y agrega uno o varios productos. El total se calcula automáticamente.
          </p>
        </div>
        {quote && (
          <button
            type="button"
            onClick={resetQuote}
            className="h-9 px-3 rounded-lg border border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] text-[13px] font-medium text-[#475569] inline-flex items-center gap-2 cursor-pointer self-start sm:self-auto"
          >
            <RotateCcw className="h-4 w-4" />
            Nueva cotización
          </button>
        )}
      </div>

      <form onSubmit={handleGenerate} className="quote-no-print stitch-card p-5 sm:p-6 space-y-5">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center">
            <FileText className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-[#0F172A]">Datos de la cotización</h3>
            <p className="text-[12px] text-[#64748B]">Los precios se expresan en quetzales.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="text-[12px] font-medium text-[#1E293B] md:col-span-2">
            Nombre del cliente
            <input
              type="text"
              required
              maxLength={160}
              value={draft.clientName}
              onChange={(event) => updateClientName(event.target.value)}
              placeholder="Nombre completo o empresa"
              className="stitch-input w-full px-3 mt-1"
            />
          </label>

          <section className="md:col-span-2 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h4 className="text-[13px] font-semibold text-[#0F172A]">Productos y servicios</h4>
                <p className="text-[11px] text-[#64748B] mt-0.5">Agrega una línea por cada producto o servicio.</p>
              </div>
              <button
                type="button"
                onClick={addLine}
                className="h-9 px-3 rounded-lg border border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] text-[12px] font-medium text-[#1E293B] inline-flex items-center justify-center gap-2 cursor-pointer self-start sm:self-auto"
              >
                <Plus className="h-4 w-4" />
                Agregar artículo
              </button>
            </div>

            <div className="space-y-3">
              {draft.items.map((item, index) => (
                <div
                  key={item.id}
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_105px_145px_145px_auto] gap-3 items-end rounded-lg border border-[#E2E8F0] p-3 sm:p-4"
                >
                  <label className="text-[12px] font-medium text-[#1E293B]">
                    Descripción
                    <textarea
                      required
                      maxLength={3000}
                      value={item.description}
                      onChange={(event) => updateLine(item.id, 'description', event.target.value)}
                      placeholder="Producto o servicio"
                      className="stitch-input w-full px-3 py-2 mt-1 min-h-[70px] h-auto resize-y"
                    />
                  </label>
                  <label className="text-[12px] font-medium text-[#1E293B]">
                    Cantidad
                    <input
                      type="number"
                      required
                      min="1"
                      step="1"
                      value={item.quantity}
                      onChange={(event) => updateLine(item.id, 'quantity', event.target.value)}
                      placeholder="0"
                      className="stitch-input w-full px-3 mt-1 tabular-metrics"
                    />
                  </label>
                  <label className="text-[12px] font-medium text-[#1E293B]">
                    Precio unitario (Q)
                    <input
                      type="number"
                      required
                      min="0.01"
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(event) => updateLine(item.id, 'unitPrice', event.target.value)}
                      placeholder="0.00"
                      className="stitch-input w-full px-3 mt-1 tabular-metrics"
                    />
                  </label>
                  <div className="text-[12px]">
                    <div className="font-medium text-[#1E293B]">Importe</div>
                    <div className="h-[38px] flex items-center text-[13px] font-medium text-[#0F172A] tabular-metrics whitespace-nowrap">
                      {formatQuetzales(items[index].total)}
                    </div>
                  </div>
                  {draft.items.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeLine(item.id)}
                      aria-label={'Quitar artículo ' + (index + 1)}
                      title="Quitar artículo"
                      className="h-9 w-9 rounded-lg border border-[#E2E8F0] bg-white hover:bg-[#FEF2F2] hover:text-[#DC2626] flex items-center justify-center text-[#64748B] cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : (
                    <span className="hidden lg:block h-9 w-9" aria-hidden="true" />
                  )}
                </div>
              ))}
            </div>
          </section>

          <label className="text-[12px] font-medium text-[#1E293B] md:col-span-2">
            Comentarios, términos y condiciones
            <textarea
              maxLength={5000}
              value={draft.terms}
              onChange={(event) => setDraft((current) => ({ ...current, terms: event.target.value }))}
              placeholder="Agrega condiciones de pago, tiempo de entrega, vigencia u otras notas"
              className="stitch-input w-full px-3 py-2 mt-1 min-h-[112px] h-auto resize-y"
            />
          </label>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-t border-[#E2E8F0] pt-4">
          <div>
            <div className="stitch-label-sm">Precio final</div>
            <div className="text-[22px] font-semibold text-[#0F172A] tabular-metrics mt-0.5">
              {formatQuetzales(total)}
            </div>
            <div className="text-[11px] text-[#64748B]">Suma de los importes</div>
          </div>
          <button
            type="submit"
            className="h-10 px-4 rounded-lg bg-[#0F172A] hover:bg-[#1E293B] text-white text-[13px] font-medium inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <FileText className="h-4 w-4" />
            Generar cotización
          </button>
        </div>
      </form>

      {quote && (
        <section className="space-y-3">
          <div className="quote-no-print flex items-center justify-between gap-3">
            <h3 className="text-[16px] font-semibold text-[#0F172A]">Vista previa</h3>
            <button
              type="button"
              onClick={handlePrint}
              className="h-9 px-3 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[13px] font-medium inline-flex items-center gap-2 cursor-pointer"
            >
              <Printer className="h-4 w-4" />
              Imprimir / Guardar PDF
            </button>
          </div>

          <article className="quote-print-area stitch-card p-6 sm:p-8 max-w-3xl">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 border-b border-[#E2E8F0] pb-5">
              <div className="flex items-center gap-4">
                <img
                  src="/maker-labs-logo.jpg"
                  alt="Maker Labs — De la idea a la realidad"
                  width={240}
                  height={240}
                  className="h-28 w-28 shrink-0 rounded-lg object-contain bg-black print:bg-black"
                />
              </div>
              <div className="sm:text-right">
                <div className="stitch-label-sm">Cotización</div>
                <div className="text-[16px] font-semibold text-[#0F172A] tabular-metrics mt-1">{quote.quoteNumber}</div>
                <div className="text-[12px] text-[#64748B] mt-1">{quote.date}</div>
              </div>
            </div>

            <div className="py-5 border-b border-[#E2E8F0]">
              <div className="stitch-label-sm">Preparada para</div>
              <div className="text-[15px] font-semibold text-[#0F172A] mt-1">{quote.clientName}</div>
            </div>

            <div className="py-5">
              <div className="stitch-label-sm mb-2">Detalle del producto o servicio</div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                      <th className="px-3 py-2 stitch-label-sm">Descripción</th>
                      <th className="px-3 py-2 stitch-label-sm text-right">Cantidad</th>
                      <th className="px-3 py-2 stitch-label-sm text-right">Precio unitario</th>
                      <th className="px-3 py-2 stitch-label-sm text-right">Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quote.items.map((item, index) => (
                      <tr key={index} className="border-b border-[#F1F5F9] align-top quote-item-row">
                        <td className="px-3 py-3 text-[13px] text-[#1E293B] whitespace-pre-wrap">{item.description}</td>
                        <td className="px-3 py-3 text-[13px] text-right text-[#1E293B] tabular-metrics">{item.quantity}</td>
                        <td className="px-3 py-3 text-[13px] text-right text-[#1E293B] tabular-metrics whitespace-nowrap">{formatQuetzales(item.unitPrice)}</td>
                        <td className="px-3 py-3 text-[13px] text-right font-medium text-[#0F172A] tabular-metrics whitespace-nowrap">{formatQuetzales(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end border-b border-[#E2E8F0] pb-5">
              <div className="w-full sm:w-64 flex items-center justify-between gap-6 rounded-lg bg-[#F8FAFC] px-4 py-3">
                <span className="text-[13px] font-semibold text-[#0F172A]">Total final</span>
                <span className="text-[17px] font-semibold text-[#0F172A] tabular-metrics whitespace-nowrap">{formatQuetzales(quote.total)}</span>
              </div>
            </div>

            {quote.terms && (
              <div className="pt-5">
                <div className="stitch-label-sm mb-2">Comentarios, términos y condiciones</div>
                <p className="text-[12px] text-[#475569] leading-5 whitespace-pre-wrap">{quote.terms}</p>
              </div>
            )}
          </article>
        </section>
      )}
    </div>
  );
};
