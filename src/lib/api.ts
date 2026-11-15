import type {
  DashboardPayload,
  DbStatusPayload,
  DocType,
  DocTypeFilter,
  FinancesPayload,
  FinancialAttachment,
  FinancialEntry,
  InventoryItem,
  Machine,
  User,
  UserRole,
  WorkOrder,
} from '../types/workshop';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
    ...options,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Error HTTP ${res.status}`);
  }
  return data as T;
}

export const api = {
  // Auth
  me: () => request<{ user: User }>('/api/auth/me'),
  login: (email: string, password: string) =>
    request<{ user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  register: (name: string, email: string, password: string) =>
    request<{ user: User }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  // Users
  getUsers: () => request<{ users: User[] }>('/api/users'),
  createUser: (payload: { name: string; email: string; password: string; role: UserRole }) =>
    request<{ user: User }>('/api/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateUserRole: (id: number, role: UserRole) =>
    request<{ user: User }>(`/api/users/${id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),
  deleteUser: (id: number) => request<{ ok: boolean }>(`/api/users/${id}`, { method: 'DELETE' }),

  // System & D1
  getDbStatus: () => request<DbStatusPayload>('/api/system/db-status'),

  // Dashboard
  getDashboard: (docType: DocTypeFilter = 'all') =>
    request<DashboardPayload>(`/api/dashboard?doc_type=${encodeURIComponent(docType)}`),

  // Machines
  getMachines: (category?: string) =>
    request<{ machines: Machine[] }>(
      category ? `/api/machines?category=${encodeURIComponent(category)}` : '/api/machines'
    ),
  updateMachine: (id: string, payload: Partial<Machine>) =>
    request<{ machine: Machine }>(`/api/machines/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  // Orders
  getOrders: (params?: {
    search?: string;
    process_type?: string;
    production_status?: string;
    payment_status?: string;
    doc_type?: DocTypeFilter;
  }) => {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.process_type && params.process_type !== 'all') q.set('process_type', params.process_type);
    if (params?.production_status && params.production_status !== 'all')
      q.set('production_status', params.production_status);
    if (params?.payment_status && params.payment_status !== 'all') q.set('payment_status', params.payment_status);
    if (params?.doc_type && params.doc_type !== 'all') q.set('doc_type', params.doc_type);
    const qs = q.toString();
    return request<{ orders: WorkOrder[] }>(`/api/orders${qs ? `?${qs}` : ''}`);
  },
  getDeletedOrders: () => request<{ orders: WorkOrder[] }>('/api/orders/deleted'),
  createOrder: (payload: {
    client_name: string;
    client_nit: string;
    process_type: string;
    machine_id: string | null;
    material: string;
    description: string;
    quantity: number;
    estimated_minutes: number;
    unit_price_gtq: number;
    doc_type: DocType;
    payment_status: string;
    initial_payment_type?: 'none' | 'advance' | 'full';
    initial_payment_status?: 'pendiente' | 'cobrado';
    initial_payment_amount?: number;
    production_status: string;
    due_date: string;
  }) =>
    request<{ order: WorkOrder }>('/api/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  recordOrderPayment: (id: number, payload: { type: 'advance' | 'full'; status: 'pendiente' | 'cobrado'; amount?: number }) =>
    request<{ order: WorkOrder; payment: FinancialEntry | null }>(`/api/orders/${id}/payments`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateOrder: (id: number, payload: Partial<WorkOrder>) =>
    request<{ order: WorkOrder }>(`/api/orders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteOrder: (id: number) => request<{ ok: boolean }>(`/api/orders/${id}`, { method: 'DELETE' }),

  // Inventory
  getInventory: (params?: { search?: string; category?: string; low_stock?: boolean }) => {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.category && params.category !== 'all') q.set('category', params.category);
    if (params?.low_stock) q.set('low_stock', 'true');
    const qs = q.toString();
    return request<{ items: InventoryItem[] }>(`/api/inventory${qs ? `?${qs}` : ''}`);
  },
  createInventoryItem: (payload: Omit<InventoryItem, 'id' | 'updated_at'>) =>
    request<{ item: InventoryItem }>('/api/inventory', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateInventoryItem: (
    id: number,
    payload: { stock_qty?: number; delta_qty?: number; min_stock_qty?: number; unit_cost_gtq?: number }
  ) =>
    request<{ item: InventoryItem }>(`/api/inventory/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteInventoryItem: (id: number) =>
    request<{ ok: boolean }>(`/api/inventory/${id}`, { method: 'DELETE' }),

  // Finances
  getFinances: (params?: {
    search?: string;
    entry_type?: string;
    doc_type?: DocTypeFilter;
    status?: string;
  }) => {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.entry_type && params.entry_type !== 'all') q.set('entry_type', params.entry_type);
    if (params?.doc_type && params.doc_type !== 'all') q.set('doc_type', params.doc_type);
    if (params?.status && params.status !== 'all') q.set('status', params.status);
    const qs = q.toString();
    return request<FinancesPayload>(`/api/finances${qs ? `?${qs}` : ''}`);
  },
  createFinancialEntry: (payload: {
    entry_type: 'ingreso' | 'egreso';
    doc_type: DocType;
    category: string;
    description: string;
    counterparty: string;
    nit: string;
    total_gtq: number;
    entry_date: string;
    status?: string;
  }) =>
    request<{ entry: FinancialEntry }>('/api/finances', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateFinancialEntry: (id: number, payload: { status?: string; doc_type?: DocType }) =>
    request<{ entry: FinancialEntry }>(`/api/finances/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteFinancialEntry: (id: number) =>
    request<{ ok: boolean }>(`/api/finances/${id}`, { method: 'DELETE' }),

  getFinancialAttachments: (entryId: number) =>
    request<{ attachments: FinancialAttachment[] }>(`/api/finances/${entryId}/attachments`),
  uploadFinancialAttachment: async (entryId: number, file: File) => {
    const response = await fetch(`/api/finances/${entryId}/attachments`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-File-Name': encodeURIComponent(file.name),
        'X-File-Content-Type': file.type || 'application/octet-stream',
      },
      body: file,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Error HTTP ${response.status}`);
    return data as { attachment: FinancialAttachment };
  },
  deleteFinancialAttachment: (entryId: number, attachmentId: string) =>
    request<{ ok: boolean }>(`/api/finances/${entryId}/attachments/${encodeURIComponent(attachmentId)}`, {
      method: 'DELETE',
    }),
};
