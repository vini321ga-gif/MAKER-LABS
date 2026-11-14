import React from 'react';
import { Box, Droplets, Wind, Zap } from 'lucide-react';
import { getProductionStatusBadge, StatusPill } from './StatusPill';
import type { Machine } from '../types/workshop';

interface MachineFleetStripProps {
  machines: Machine[];
  onSelectMachine?: (machine: Machine) => void;
}

export const MachineFleetStrip: React.FC<MachineFleetStripProps> = ({ machines, onSelectMachine }) => {
  const printers = machines.filter((m) => m.category === '3d_printing');
  const lasers = machines.filter((m) => m.category === 'laser');
  const dtfUnits = machines.filter((m) => m.category === 'uv_dtf');

  const activePrinter = printers.find((p) => p.status === 'en_produccion') || printers[0];
  const activeLaser = lasers.find((l) => l.status === 'en_produccion') || lasers[0];
  const activeDtf = dtfUnits[0];

  const renderProgressBar = (pct: number, color: string) => (
    <div className="h-1.5 w-full rounded-full bg-[#F1F5F9] overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: color }}
      />
    </div>
  );

  return (
    <div className="stitch-card p-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <div>
          <span className="stitch-label-sm">Telemetría de Flota en Tiempo Real</span>
          <h3 className="text-[16px] font-semibold text-[#0F172A] mt-0.5">
            Estado Operativo de Maquinaria
          </h3>
        </div>
        <div className="text-[12px] text-[#64748B] tabular-metrics">
          {machines.filter((m) => m.status === 'en_produccion' || m.status === 'calentando').length} de{' '}
          {machines.length} equipos en ciclo activo
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 3D Printing Strip */}
        {activePrinter && (
          <div
            onClick={() => onSelectMachine?.(activePrinter)}
            className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 hover:border-[#CBD5E1] transition-colors cursor-pointer"
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-8 w-8 rounded-lg bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center shrink-0">
                  <Box className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-[#0F172A] truncate">
                    Impresión 3D · {activePrinter.name}
                  </div>
                  <div className="text-[11px] text-[#64748B] truncate">{activePrinter.model}</div>
                </div>
              </div>
              <StatusPill {...getProductionStatusBadge(activePrinter.status)} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-[12px] tabular-metrics">
                <span className="text-[#64748B]">
                  Orden: <strong className="text-[#0F172A]">{activePrinter.current_job_code || 'En espera'}</strong>
                </span>
                <span className="font-semibold text-[#0F172A]">{activePrinter.progress_pct}%</span>
              </div>
              {renderProgressBar(activePrinter.progress_pct, '#2563EB')}
              <div className="grid grid-cols-3 gap-2 pt-1 text-[11px] tabular-metrics text-[#64748B]">
                <div>
                  Capa:{' '}
                  <span className="font-medium text-[#0F172A]">
                    {activePrinter.telemetry.layer_height_mm ?? 0.16}mm
                  </span>
                </div>
                <div>
                  Cama:{' '}
                  <span className="font-medium text-[#0F172A]">
                    {activePrinter.telemetry.bed_temp_c ?? 60}°C
                  </span>
                </div>
                <div>
                  Boquilla:{' '}
                  <span className="font-medium text-[#0F172A]">
                    {activePrinter.telemetry.nozzle_temp_c ?? 220}°C
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Laser Strip */}
        {activeLaser && (
          <div
            onClick={() => onSelectMachine?.(activeLaser)}
            className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 hover:border-[#CBD5E1] transition-colors cursor-pointer"
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-8 w-8 rounded-lg bg-[#FFFBEB] text-[#D97706] flex items-center justify-center shrink-0">
                  <Zap className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-[#0F172A] truncate">
                    Láser · {activeLaser.name}
                  </div>
                  <div className="text-[11px] text-[#64748B] truncate">{activeLaser.model}</div>
                </div>
              </div>
              <StatusPill {...getProductionStatusBadge(activeLaser.status)} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-[12px] tabular-metrics">
                <span className="text-[#64748B]">
                  Vida Tubo: <strong className="text-[#0F172A]">{activeLaser.telemetry.tube_life_pct ?? 85}%</strong>
                </span>
                <span className="font-semibold text-[#0F172A]">
                  Avance {activeLaser.progress_pct}%
                </span>
              </div>
              {renderProgressBar(activeLaser.progress_pct, '#F59E0B')}
              <div className="flex items-center justify-between pt-1 text-[11px] tabular-metrics text-[#64748B]">
                <span>
                  Potencia: <strong className="text-[#0F172A]">{activeLaser.telemetry.power_pct ?? 75}%</strong>
                </span>
                <span className="inline-flex items-center gap-1">
                  <Wind className="h-3 w-3 text-[#059669]" />
                  Air Assist:{' '}
                  <strong className={activeLaser.telemetry.air_assist ? 'text-[#059669]' : 'text-[#64748B]'}>
                    {activeLaser.telemetry.air_assist ? 'Activo' : 'Inactivo'}
                  </strong>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* UV DTF Strip */}
        {activeDtf && (
          <div
            onClick={() => onSelectMachine?.(activeDtf)}
            className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 hover:border-[#CBD5E1] transition-colors cursor-pointer"
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-8 w-8 rounded-lg bg-[#ECFDF5] text-[#059669] flex items-center justify-center shrink-0">
                  <Droplets className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-[#0F172A] truncate">
                    UV DTF · {activeDtf.name}
                  </div>
                  <div className="text-[11px] text-[#64748B] truncate">{activeDtf.model}</div>
                </div>
              </div>
              <StatusPill {...getProductionStatusBadge(activeDtf.status)} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-[12px] tabular-metrics">
                <span className="text-[#64748B]">Niveles CMYK + W + Barniz</span>
                <span className="font-semibold text-[#0F172A]">{activeDtf.progress_pct}%</span>
              </div>
              <div className="grid grid-cols-6 gap-1.5 pt-0.5">
                {[
                  { label: 'C', val: activeDtf.telemetry.ink_c ?? 75, color: '#06B6D4' },
                  { label: 'M', val: activeDtf.telemetry.ink_m ?? 65, color: '#EC4899' },
                  { label: 'Y', val: activeDtf.telemetry.ink_y ?? 80, color: '#EAB308' },
                  { label: 'K', val: activeDtf.telemetry.ink_k ?? 55, color: '#0F172A' },
                  { label: 'W', val: activeDtf.telemetry.ink_w ?? 38, color: '#94A3B8' },
                  { label: 'V', val: activeDtf.telemetry.ink_varnish ?? 70, color: '#2563EB' },
                ].map((ink) => (
                  <div key={ink.label} className="text-center">
                    <div className="h-1.5 w-full rounded-full bg-[#E2E8F0] overflow-hidden mb-1">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${ink.val}%`, backgroundColor: ink.color }}
                      />
                    </div>
                    <div className="text-[10px] font-medium text-[#64748B] tabular-metrics">
                      {ink.label} {ink.val}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
