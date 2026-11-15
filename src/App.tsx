import React, { useCallback, useEffect, useState } from 'react';
import { Menu, Plus, RefreshCw } from 'lucide-react';
import { AuthScreen } from './components/AuthScreen';
import { ExpenseModal } from './components/ExpenseModal';
import { InventoryModal } from './components/InventoryModal';
import { OrderModal } from './components/OrderModal';
import { Sidebar } from './components/Sidebar';
import { StatusPill } from './components/StatusPill';
import { ToastContainer, type ToastMessage } from './components/Toast';
import { AdminD1View } from './components/views/AdminD1View';
import { ActivityView } from './components/views/ActivityView';
import { DashboardView } from './components/views/DashboardView';
import { DtfInventoryView } from './components/views/DtfInventoryView';
import { FinancesView } from './components/views/FinancesView';
import { LaserTelemetryView } from './components/views/LaserTelemetryView';
import { Print3DQueueView } from './components/views/Print3DQueueView';
import { WorkOrdersView } from './components/views/WorkOrdersView';
import { api } from './lib/api';
import type {
  ActivityEvent,
  DashboardPayload,
  DbStatusPayload,
  DocTypeFilter,
  FinancesPayload,
  InventoryItem,
  Machine,
  MachineCategory,
  NavSection,
  User,
  WorkOrder,
} from './types/workshop';

const SECTION_TITLES: Record<NavSection, string> = {
  dashboard: 'Panel Principal',
  orders: 'Órdenes de Producción',
  printing_3d: 'Cola de Impresión 3D',
  laser: 'Telemetría Corte Láser',
  uv_dtf: 'Inventario UV DTF',
  finances: 'Facturación y Finanzas',
  admin: 'Usuarios y Cloudflare D1',
  activity: 'Registro de actividad',
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [docFilter, setDocFilter] = useState<DocTypeFilter>('all');
  const [loadingData, setLoadingData] = useState(false);

  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [deletedOrders, setDeletedOrders] = useState<WorkOrder[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [finances, setFinances] = useState<FinancesPayload | null>(null);
  const [dbStatus, setDbStatus] = useState<DbStatusPayload | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [orderModalProcess, setOrderModalProcess] = useState<MachineCategory>('3d_printing');
  const [orderModalSession, setOrderModalSession] = useState(0);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [inventoryModalOpen, setInventoryModalOpen] = useState(false);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const notify = useCallback((type: ToastMessage['type'], message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const loadWorkspaceData = useCallback(
    async (currentUser: User, currentDocFilter: DocTypeFilter) => {
      setLoadingData(true);
      try {
        const [dashRes, machRes, ordRes, invRes, finRes, deletedRes] = await Promise.all([
          api.getDashboard(currentDocFilter),
          api.getMachines(),
          api.getOrders(),
          api.getInventory(),
          api.getFinances(),
          currentUser.role === 'admin' || currentUser.role === 'finance'
            ? api.getDeletedOrders()
            : Promise.resolve({ orders: [] as WorkOrder[] }),
        ]);
        const dbRes = currentUser.role === 'admin' ? await api.getDbStatus() : null;

        setDashboard(dashRes);
        setMachines(machRes.machines);
        setOrders(ordRes.orders);
        setDeletedOrders(deletedRes.orders);
        setInventory(invRes.items);
        setFinances(finRes);
        setDbStatus(dbRes);

        if (currentUser.role === 'admin') {
          const usersRes = await api.getUsers();
          setUsers(usersRes.users);
        } else {
          setUsers([]);
        }
      } catch (err) {
        notify('error', err instanceof Error ? err.message : 'Error sincronizando datos');
      } finally {
        setLoadingData(false);
      }
    },
    [notify]
  );

  useEffect(() => {
    api
      .me()
      .then((res) => {
        setUser(res.user);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => {
        setAuthChecked(true);
      });
  }, []);

  useEffect(() => {
    if (user) {
      loadWorkspaceData(user, docFilter);
    }
  }, [user, docFilter, loadWorkspaceData]);

  const handleLogout = async () => {
    await api.logout().catch(() => undefined);
    setUser(null);
    setDashboard(null);
    notify('info', 'Sesión cerrada');
  };

  const handleUpdateMachine = async (id: string, payload: Partial<Machine>) => {
    try {
      await api.updateMachine(id, payload);
      notify('success', `Telemetría actualizada en ${id}`);
      if (user) await loadWorkspaceData(user, docFilter);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'No se pudo actualizar equipo');
    }
  };

  const handleUpdateOrder = async (id: number, payload: Partial<WorkOrder>) => {
    try {
      await api.updateOrder(id, payload);
      notify('success', 'Orden actualizada en base de datos');
      if (user) await loadWorkspaceData(user, docFilter);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'No se pudo actualizar orden');
    }
  };

  const handleDeleteOrder = async (id: number) => {
    const reason = window.prompt('Escribe la justificación para borrar esta orden:')?.trim();
    if (!reason) { notify('info', 'No se borró la orden; se requiere una justificación.'); return; }
    try {
      await api.deleteOrder(id, reason);
      notify('success', 'Orden eliminada');
      if (user) await loadWorkspaceData(user, docFilter);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'No se pudo eliminar orden');
    }
  };

  const handleAdjustStock = async (id: number, delta: number) => {
    try {
      await api.updateInventoryItem(id, { delta_qty: delta });
      notify('success', `Inventario ajustado (${delta > 0 ? `+${delta}` : delta})`);
      if (user) await loadWorkspaceData(user, docFilter);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Error ajustando stock');
    }
  };

  const handleDeleteInventoryItem = async (id: number) => {
    const reason = window.prompt('Escribe la justificación para eliminar este insumo:')?.trim();
    if (!reason) { notify('info', 'No se eliminó el insumo; se requiere una justificación.'); return; }
    try {
      await api.deleteInventoryItem(id, reason);
      notify('success', 'Insumo eliminado');
      if (user) await loadWorkspaceData(user, docFilter);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Error eliminando insumo');
    }
  };

  const handleUpdateFinancialEntry = async (id: number, payload: { status?: string }) => {
    try {
      await api.updateFinancialEntry(id, payload);
      notify('success', 'Registro contable actualizado');
      if (user) await loadWorkspaceData(user, docFilter);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Error actualizando movimiento');
    }
  };

  const handleDeleteFinancialEntry = async (id: number) => {
    const reason = window.prompt('Escribe la justificación para eliminar este movimiento financiero:')?.trim();
    if (!reason) { notify('info', 'No se eliminó el movimiento; se requiere una justificación.'); return; }
    try {
      await api.deleteFinancialEntry(id, reason);
      notify('success', 'Asiento eliminado');
      if (user) await loadWorkspaceData(user, docFilter);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Error eliminando asiento');
    }
  };

  const loadActivity = useCallback(async () => {
    setActivityLoading(true);
    try {
      const result = await api.getActivityLog();
      setActivityEvents(result.events);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'No se pudo cargar el registro de actividad');
    } finally {
      setActivityLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    if (user && activeSection === 'activity' && (user.role === 'admin' || user.role === 'finance')) {
      void loadActivity();
    }
  }, [user, activeSection, loadActivity]);

  const openOrderModal = (process: MachineCategory = '3d_printing') => {
    setOrderModalProcess(process);
    setOrderModalSession((current) => current + 1);
    setOrderModalOpen(true);
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center text-[13px] text-[#64748B]">
        Verificando sesión operativa...
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <AuthScreen
          onSuccess={(loggedUser) => {
            setUser(loggedUser);
            setActiveSection('dashboard');
            notify('success', `Bienvenido, ${loggedUser.name}`);
          }}
        />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  const handleRecordOrderPayment = async (
    id: number,
    payload: { type: 'advance' | 'full'; status: 'pendiente' | 'cobrado'; amount?: number }
  ) => {
    const result = await api.recordOrderPayment(id, payload);
    notify('success', payload.type === 'advance' ? 'Anticipo registrado' : 'Pago total registrado');
    if (user) await loadWorkspaceData(user, docFilter);
    return result;
  };

  const lowStockCount = inventory.filter((i) => i.stock_qty <= i.min_stock_qty).length;
  const activeOrdersCount = orders.filter((o) => o.production_status !== 'completado').length;
  const canFinanceEdit = user.role === 'admin' || user.role === 'finance';
  const canViewBalances = user.role !== 'operator';
  const canViewFinancialDetails = user.role !== 'operator';
  const canRegisterFinancialEntries = true;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex">
      <Sidebar
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        user={user}
        onLogout={handleLogout}
        lowStockCount={lowStockCount}
        activeOrdersCount={activeOrdersCount}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar */}
        <header className="sticky top-0 z-20 h-16 bg-[#FFFFFF]/95 backdrop-blur-xs border-b border-[#E2E8F0] px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden h-9 w-9 rounded-lg border border-[#E2E8F0] flex items-center justify-center text-[#475569] hover:text-[#0F172A]"
              aria-label="Abrir menú"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 text-[13px] min-w-0">
              <span className="text-[#64748B] hidden sm:inline">PrecisionHub</span>
              <span className="text-[#CBD5E1] hidden sm:inline">/</span>
              <span className="font-semibold text-[#0F172A] truncate">
                {SECTION_TITLES[activeSection]}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {dbStatus && (
              <button
                type="button"
                onClick={() => setActiveSection('admin')}
                className="hidden sm:inline-flex cursor-pointer"
                title="Ver estado de base de datos"
              >
                <StatusPill
                  label={dbStatus.status.mode === 'cloudflare_d1' ? 'Cloudflare D1' : 'SQLite D1 Local'}
                  variant={dbStatus.status.connected ? 'emerald' : 'crimson'}
                />
              </button>
            )}

            <button
              type="button"
              onClick={() => loadWorkspaceData(user, docFilter)}
              disabled={loadingData}
              title="Sincronizar datos"
              className="h-9 w-9 rounded-lg border border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] flex items-center justify-center text-[#475569] cursor-pointer"
            >
              <RefreshCw className={`h-4 w-4 ${loadingData ? 'animate-spin' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() => openOrderModal('3d_printing')}
              className="h-9 px-3.5 rounded-lg bg-[#0F172A] hover:bg-[#1E293B] text-white text-[13px] font-medium inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Nueva Orden</span>
            </button>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-[1600px] w-full mx-auto">
          {activeSection === 'dashboard' && (
            <DashboardView
              data={dashboard}
              loading={loadingData}
              docFilter={docFilter}
              onChangeDocFilter={setDocFilter}
              onNavigate={setActiveSection}
              onOpenNewOrder={() => openOrderModal('3d_printing')}
              onQuickMarkPaid={(o) => void handleRecordOrderPayment(o.id, { type: 'full', status: 'cobrado' }).catch((err) => notify('error', err instanceof Error ? err.message : 'Error registrando pago'))}
              onQuickAdvance={(o, amount, status) => handleRecordOrderPayment(o.id, { type: 'advance', amount, status })}
              onQuickCompleteOrder={(o) => handleUpdateOrder(o.id, { production_status: 'completado' })}
              canViewBalances={canViewBalances}
              canViewFinancialDetails={canViewFinancialDetails}
            />
          )}

          {activeSection === 'printing_3d' && (
            <Print3DQueueView
              machines={machines}
              orders={orders}
              canViewFinancialDetails={canViewFinancialDetails}
              onUpdateMachine={handleUpdateMachine}
              onUpdateOrder={handleUpdateOrder}
              onRegisterOrderPayment={handleRecordOrderPayment}
              onDeleteOrder={handleDeleteOrder}
              canDelete={user.role === 'admin'}
              onOpenNewOrder={() => openOrderModal('3d_printing')}
            />
          )}

          {activeSection === 'laser' && (
            <LaserTelemetryView
              machines={machines}
              orders={orders}
              canViewFinancialDetails={canViewFinancialDetails}
              onUpdateMachine={handleUpdateMachine}
              onUpdateOrder={handleUpdateOrder}
              onOpenNewOrder={() => openOrderModal('laser')}
            />
          )}

          {activeSection === 'uv_dtf' && (
            <DtfInventoryView
              machines={machines}
              items={inventory}
              onUpdateMachine={handleUpdateMachine}
              onAdjustStock={handleAdjustStock}
              onDeleteItem={handleDeleteInventoryItem}
              onOpenNewItem={() => setInventoryModalOpen(true)}
              canAdminDelete={user.role === 'admin'}
            />
          )}

          {activeSection === 'orders' && (
            <WorkOrdersView
              orders={orders}
              docFilter={docFilter}
              onChangeDocFilter={setDocFilter}
              onUpdateOrder={handleUpdateOrder}
              onDeleteOrder={handleDeleteOrder}
              onRegisterOrderPayment={handleRecordOrderPayment}
              deletedOrders={deletedOrders}
              onOpenNewOrder={() => openOrderModal('3d_printing')}
              canDelete={user.role === 'admin'}
              canViewFinancialDetails={canViewFinancialDetails}
            />
          )}

          {activeSection === 'finances' && (
            <FinancesView
              data={finances}
              docFilter={docFilter}
              onChangeDocFilter={setDocFilter}
              onUpdateEntry={handleUpdateFinancialEntry}
              onDeleteEntry={handleDeleteFinancialEntry}
              onOpenNewEntry={() => setExpenseModalOpen(true)}
              canEdit={canFinanceEdit}
              canDelete={user.role === 'admin'}
              canCreate={canRegisterFinancialEntries}
              canViewBalances={canViewBalances}
            />
          )}

          {activeSection === 'activity' && (user.role === 'admin' || user.role === 'finance') && (
            <ActivityView events={activityEvents} loading={activityLoading} onRefresh={() => void loadActivity()} />
          )}

          {activeSection === 'admin' && user.role === 'admin' && (
            <AdminD1View
              currentUser={user}
              users={users}
              dbStatus={dbStatus}
              onRefresh={() => loadWorkspaceData(user, docFilter)}
              onNotify={notify}
            />
          )}
        </main>
      </div>

      {/* Modals */}
      <OrderModal
        key={orderModalSession}
        open={orderModalOpen}
        machines={machines}
        initialProcess={orderModalProcess}
        onClose={() => setOrderModalOpen(false)}
        onCreated={async (created) => {
          notify('success', `Orden ${created.order_code} creada y registrada en finanzas`);
          await loadWorkspaceData(user, docFilter);
        }}
        onError={(msg) => notify('error', msg)}
      />

      <ExpenseModal
        open={expenseModalOpen}
        onClose={() => setExpenseModalOpen(false)}
        onCreated={async (entry) => {
          notify('success', `Movimiento ${entry.entry_code} registrado`);
          await loadWorkspaceData(user, docFilter);
        }}
        onError={(msg) => notify('error', msg)}
      />

      <InventoryModal
        open={inventoryModalOpen}
        onClose={() => setInventoryModalOpen(false)}
        onCreated={async (item) => {
          notify('success', `Insumo ${item.sku} agregado al catálogo`);
          await loadWorkspaceData(user, docFilter);
        }}
        onError={(msg) => notify('error', msg)}
      />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
