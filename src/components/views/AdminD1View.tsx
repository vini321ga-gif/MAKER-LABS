import React, { useState } from 'react';
import { Check, Copy, Database, Shield, Trash2, UserPlus } from 'lucide-react';
import { api } from '../../lib/api';
import { formatRoleLabel } from '../../lib/format';
import type { DbStatusPayload, User, UserRole } from '../../types/workshop';
import { StatusPill } from '../StatusPill';

interface AdminD1ViewProps {
  currentUser: User;
  users: User[];
  dbStatus: DbStatusPayload | null;
  onRefresh: () => Promise<void>;
  onNotify: (type: 'success' | 'error' | 'info', msg: string) => void;
}

export const AdminD1View: React.FC<AdminD1ViewProps> = ({
  currentUser,
  users,
  dbStatus,
  onRefresh,
  onNotify,
}) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('operator');
  const [creating, setCreating] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  const isAdmin = currentUser.role === 'admin';

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await api.createUser({ name, email, password, role });
      setName('');
      setEmail('');
      setPassword('');
      onNotify('success', 'Usuario creado correctamente');
      await onRefresh();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error creando usuario');
    } finally {
      setCreating(false);
    }
  };

  const handleRoleChange = async (id: number, nextRole: UserRole) => {
    try {
      await api.updateUserRole(id, nextRole);
      onNotify('success', 'Rol actualizado');
      await onRefresh();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error actualizando rol');
    }
  };

  const handleDeleteUser = async (id: number) => {
    const reason = window.prompt('Escribe la justificación para eliminar este usuario:')?.trim();
    if (!reason) { onNotify('info', 'No se eliminó el usuario; se requiere una justificación.'); return; }
    try {
      await api.deleteUser(id, reason);
      onNotify('success', 'Usuario eliminado');
      await onRefresh();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Error eliminando usuario');
    }
  };

  const handleCopySchema = () => {
    if (!dbStatus?.schemaSql) return;
    navigator.clipboard.writeText(dbStatus.schemaSql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <span className="stitch-label-sm">Infraestructura de Datos y Permisos</span>
        <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-[#0F172A] leading-8 mt-0.5">
          Usuarios, Roles y Conexión Cloudflare D1
        </h2>
      </div>

      {/* Cloudflare D1 / SQLite Status Panel */}
      {dbStatus && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div className="xl:col-span-5 stitch-card p-6 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center">
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-[16px] font-semibold text-[#0F172A]">Motor SQL Activo</h3>
                  <p className="text-[12px] text-[#64748B]">{dbStatus.status.driverLabel}</p>
                </div>
              </div>
              <StatusPill
                label={dbStatus.status.connected ? 'Operativo' : 'Error'}
                variant={dbStatus.status.connected ? 'emerald' : 'crimson'}
              />
            </div>

            <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 space-y-2 text-[12px]">
              <div className="flex justify-between">
                <span className="text-[#64748B]">Modo de ejecución:</span>
                <span className="font-semibold text-[#0F172A]">
                  {dbStatus.status.mode === 'cloudflare_d1' ? 'Cloudflare D1 (Worker binding)' : 'SQLite Local'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B]">Base de datos:</span>
                <span className="font-medium text-[#0F172A] tabular-metrics">{dbStatus.status.databaseName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B]">Binding Cloudflare D1:</span>
                <span className="font-medium text-[#0F172A]">
                  {dbStatus.status.d1Configured ? 'Configurado en Wrangler' : 'Usando SQLite local'}
                </span>
              </div>
            </div>

            <div>
              <div className="stitch-label-sm mb-2">Registros Persistidos por Tabla</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(dbStatus.counts).map(([table, count]) => (
                  <div
                    key={table}
                    className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 flex items-center justify-between text-[12px] tabular-metrics"
                  >
                    <span className="text-[#64748B] truncate">{table}</span>
                    <strong className="text-[#0F172A]">{count}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3.5 text-[12px] text-[#475569] leading-5">
              Para enlazar <strong className="text-[#0F172A]">Cloudflare D1</strong>, configura el binding{' '}
              <code className="text-[#0F172A]">DB</code> en <code className="text-[#0F172A]">wrangler.jsonc</code>{' '}
              y aplica las migraciones con <code className="text-[#0F172A]">npm run db:migrate:local</code> o{' '}
              <code className="text-[#0F172A]">npm run db:migrate:remote</code>.
            </div>
          </div>

          <div className="xl:col-span-7 stitch-card overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
              <div>
                <span className="stitch-label-sm">DDL Oficial</span>
                <h3 className="text-[16px] font-semibold text-[#0F172A]">Esquema SQL (schema.sql)</h3>
              </div>
              <button
                type="button"
                onClick={handleCopySchema}
                className="h-8 px-3 rounded-lg border border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] text-[12px] font-medium text-[#0F172A] inline-flex items-center gap-1.5 cursor-pointer"
              >
                {copiedSql ? <Check className="h-3.5 w-3.5 text-[#059669]" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedSql ? 'Copiado' : 'Copiar SQL'}
              </button>
            </div>
            <pre className="p-4 text-[11px] leading-5 text-[#1E293B] bg-[#F8FAFC] overflow-auto max-h-[320px] font-mono">
              {dbStatus.schemaSql}
            </pre>
          </div>
        </div>
      )}

      {/* User Management RBAC */}
      <div className="stitch-card overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Shield className="h-4 w-4 text-[#2563EB]" />
            <div>
              <h3 className="text-[16px] font-semibold text-[#0F172A]">Control de Acceso (RBAC)</h3>
              <p className="text-[12px] text-[#64748B]">
                Tu sesión actual: <strong>{currentUser.name}</strong> ({formatRoleLabel(currentUser.role)})
              </p>
            </div>
          </div>
        </div>

        {!isAdmin ? (
          <div className="p-6 text-[13px] text-[#64748B]">
            La administración de usuarios y roles está reservada para el perfil{' '}
            <strong className="text-[#0F172A]">Director / Admin</strong>.
          </div>
        ) : (
          <div className="p-6 space-y-6">
            <form
              onSubmit={handleCreateUser}
              className="grid grid-cols-1 md:grid-cols-5 gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4"
            >
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre completo"
                className="stitch-input px-3"
              />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo@fablab.gt"
                className="stitch-input px-3"
              />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña (mín. 6)"
                className="stitch-input px-3"
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="stitch-input px-3"
              >
                <option value="operator">Operador de Planta</option>
                <option value="finance">Supervisor</option>
                <option value="admin">Director / Admin</option>
              </select>
              <button
                type="submit"
                disabled={creating}
                className="h-[38px] px-4 rounded-lg bg-[#0F172A] hover:bg-[#1E293B] text-white text-[13px] font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <UserPlus className="h-4 w-4" />
                {creating ? 'Creando...' : 'Agregar Usuario'}
              </button>
            </form>

            <div className="overflow-x-auto border border-[#E2E8F0] rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#F8FAFC] h-10 border-b border-[#E2E8F0]">
                    <th className="px-4 stitch-label-sm">Usuario</th>
                    <th className="px-4 stitch-label-sm">Correo</th>
                    <th className="px-4 stitch-label-sm">Rol Asignado</th>
                    <th className="px-4 stitch-label-sm text-right">Alta</th>
                    <th className="px-4 stitch-label-sm text-right">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="h-[50px] border-b border-[#F1F5F9] hover:bg-[#F8FAFC]">
                      <td className="px-4 text-[13px] font-medium text-[#0F172A]">{u.name}</td>
                      <td className="px-4 text-[13px] text-[#475569] tabular-metrics">{u.email}</td>
                      <td className="px-4">
                        <select
                          value={u.role}
                          disabled={u.id === currentUser.id}
                          onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                          className="h-7 rounded-md border border-[#E2E8F0] bg-white px-2 text-[12px] font-medium text-[#0F172A] disabled:opacity-60"
                        >
                          <option value="admin">Director / Admin</option>
                          <option value="operator">Operador de Planta</option>
                          <option value="finance">Supervisor</option>
                        </select>
                      </td>
                      <td className="px-4 text-right text-[12px] text-[#64748B] tabular-metrics">
                        {u.created_at.slice(0, 10)}
                      </td>
                      <td className="px-4 text-right">
                        {u.id !== currentUser.id && (
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(u.id)}
                            className="h-7 w-7 rounded-md border border-transparent hover:border-[#FECACA] hover:bg-[#FEF2F2] hover:text-[#DC2626] inline-flex items-center justify-center text-[#94A3B8] cursor-pointer"
                            title="Eliminar usuario"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
