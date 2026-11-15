import React from 'react';
import {
  Box,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Database,
  Droplets,
  FileText,
  Layers,
  LayoutDashboard,
  LogOut,
  Receipt,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { formatRoleLabel } from '../lib/format';
import type { NavSection, User } from '../types/workshop';

interface SidebarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  user: User;
  onLogout: () => void;
  lowStockCount: number;
  activeOrdersCount: number;
}

interface NavItem {
  id: NavSection;
  label: string;
  icon: React.FC<{ className?: string }>;
  badge?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSelectSection,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  user,
  onLogout,
  lowStockCount,
  activeOrdersCount,
}) => {
  const navGroups: Array<{ title: string; items: NavItem[] }> = [
    {
      title: 'Operaciones',
      items: [
        { id: 'dashboard', label: 'Panel General', icon: LayoutDashboard },
        { id: 'orders', label: 'Órdenes de Producción', icon: ClipboardList, badge: activeOrdersCount },
        { id: 'printing_3d', label: 'Cola Impresión 3D', icon: Box },
        { id: 'laser', label: 'Telemetría Láser', icon: Zap },
        { id: 'uv_dtf', label: 'DTF & Inventario', icon: Droplets, badge: lowStockCount },
      ],
    },
    {
      title: 'Finanzas & Sistema',
      items: [
        { id: 'finances', label: 'Facturación y P&L (Q)', icon: Receipt },
        { id: 'quotes', label: 'Cotizaciones', icon: FileText },
        { id: 'activity', label: 'Registro de actividad', icon: ClipboardList },
        { id: 'admin', label: 'Usuarios y Cloudflare D1', icon: Database },
      ],
    },
  ];

  const handleSelect = (id: NavSection) => {
    onSelectSection(id);
    onCloseMobile();
  };

  const renderNavContent = (isCompact: boolean) => (
    <div className="flex h-full flex-col bg-[#FFFFFF] border-r border-[#E2E8F0]">
      {/* Brand Header */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-[#E2E8F0] shrink-0">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="h-8 w-8 rounded-lg bg-[#0F172A] text-white flex items-center justify-center shrink-0">
            <Layers className="h-4 w-4" />
          </div>
          {!isCompact && (
            <div className="min-w-0">
              <div className="text-[14px] font-semibold tracking-[-0.01em] text-[#0F172A] truncate">
                Maker Labs
              </div>
              <div className="text-[11px] text-[#64748B] truncate">Manufactura</div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onToggleCollapse}
          className="hidden lg:flex h-7 w-7 items-center justify-center rounded-md border border-[#E2E8F0] text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC] transition-colors shrink-0 cursor-pointer"
          aria-label={collapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>

        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden flex h-8 w-8 items-center justify-center rounded-md text-[#64748B] hover:text-[#0F172A]"
          aria-label="Cerrar menú"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Nav Groups */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {navGroups.map((group) => (
          <div key={group.title}>
            {!isCompact && (
              <div className="px-2.5 mb-2 stitch-label-sm">{group.title}</div>
            )}
            <div className="space-y-1">
              {group.items.filter((item) => (item.id !== 'admin' || user.role === 'admin') && (item.id !== 'activity' || user.role === 'admin' || user.role === 'finance') && (item.id !== 'quotes' || user.role === 'admin' || user.role === 'finance')).map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item.id)}
                    title={isCompact ? item.label : undefined}
                    className={`w-full flex items-center justify-between gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#EFF6FF] text-[#2563EB]'
                        : 'text-[#475569] hover:bg-[#F8FAFC] hover:text-[#0F172A]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon
                        className={`h-4 w-4 shrink-0 ${
                          active ? 'text-[#2563EB]' : 'text-[#64748B]'
                        }`}
                      />
                      {!isCompact && <span className="truncate">{item.label}</span>}
                    </div>
                    {!isCompact && item.badge !== undefined && item.badge > 0 && (
                      <span
                        className={`tabular-metrics rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          item.id === 'uv_dtf'
                            ? 'bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA]'
                            : 'bg-[#F1F5F9] text-[#475569] border border-[#E2E8F0]'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User Footer */}
      <div className="border-t border-[#E2E8F0] p-3 shrink-0">
        <div
          className={`flex items-center ${isCompact ? 'justify-center' : 'justify-between'} gap-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] p-2.5`}
        >
          {!isCompact && (
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-[#0F172A] truncate">{user.name}</div>
              <div className="text-[11px] text-[#64748B] truncate">{formatRoleLabel(user.role)}</div>
            </div>
          )}
          <button
            type="button"
            onClick={onLogout}
            title="Cerrar sesión"
            className="h-8 w-8 rounded-md flex items-center justify-center text-[#64748B] hover:text-[#DC2626] hover:bg-[#FEF2F2] transition-colors shrink-0 cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop / Tablet Sidebar */}
      <aside
        className={`hidden md:block shrink-0 transition-[width] duration-200 ${
          collapsed ? 'w-16' : 'w-64'
        }`}
      >
        <div className="sticky top-0 h-screen">{renderNavContent(collapsed)}</div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden flex">
          <div
            className="fixed inset-0 bg-[#0F172A]/40 backdrop-blur-[2px]"
            onClick={onCloseMobile}
          />
          <div className="relative z-10 w-64 max-w-[85vw] h-full">{renderNavContent(false)}</div>
        </div>
      )}
    </>
  );
};
