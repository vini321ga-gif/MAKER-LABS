import React, { useState } from 'react';
import { ArrowRight, Layers, Lock, Mail, ShieldCheck, User as UserIcon } from 'lucide-react';
import { api } from '../lib/api';
import type { User } from '../types/workshop';

interface AuthScreenProps {
  onSuccess: (user: User) => void;
}

const ACCESS_PROFILES = [
  { label: 'Director / Admin', detail: 'Primera cuenta · Registro', role: 'Control Total' },
  { label: 'Operador Planta', detail: 'Alta desde Usuarios y Roles', role: '3D · Láser · DTF' },
  { label: 'Finanzas SAT', detail: 'Alta desde Usuarios y Roles', role: 'Contabilidad Q' },
];

export const AuthScreen: React.FC<AuthScreenProps> = ({ onSuccess }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res =
        mode === 'login'
          ? await api.login(email, password)
          : await api.register(name, email, password);
      onSuccess(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo autenticar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-center items-center px-4 py-10">
      <div className="w-full max-w-[440px]">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-xl bg-[#0F172A] text-white flex items-center justify-center shrink-0">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-[20px] font-semibold tracking-[-0.015em] text-[#0F172A] leading-7">
              PrecisionHub
            </h1>
            <p className="text-[13px] text-[#64748B]">
              Manufactura Aditiva, Corte Láser, UV DTF y Finanzas SAT
            </p>
          </div>
        </div>

        <div className="stitch-card p-6 sm:p-7">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-4 mb-5">
            <div>
              <h2 className="text-[16px] font-semibold text-[#0F172A]">
                {mode === 'login' ? 'Acceso Operativo' : 'Crear Cuenta de Operador'}
              </h2>
              <p className="text-[12px] text-[#64748B] mt-0.5">
                {mode === 'login'
                  ? 'Sesión segura respaldada en base de datos SQL'
                  : 'Registro de nuevo colaborador en planta'}
              </p>
            </div>
            <div className="inline-flex rounded-lg bg-[#F1F5F9] p-1 border border-[#E2E8F0]">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className={`px-2.5 py-1 text-[12px] font-medium rounded-md transition-colors ${
                  mode === 'login'
                    ? 'bg-white text-[#0F172A] shadow-xs'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                Ingresar
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setEmail('');
                  setPassword('');
                  setError(null);
                }}
                className={`px-2.5 py-1 text-[12px] font-medium rounded-md transition-colors ${
                  mode === 'register'
                    ? 'bg-white text-[#0F172A] shadow-xs'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                Registro
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-2.5 text-[13px] text-[#DC2626]">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-[12px] font-medium text-[#1E293B] mb-1.5">
                  Nombre completo
                </label>
                <div className="relative">
                  <UserIcon className="h-4 w-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej. Ing. Mario Estrada"
                    className="stitch-input w-full pl-9 pr-3"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-[12px] font-medium text-[#1E293B] mb-1.5">
                Correo institucional
              </label>
              <div className="relative">
                <Mail className="h-4 w-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@fablab.gt"
                  className="stitch-input w-full pl-9 pr-3"
                />
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[#1E293B] mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="h-4 w-4 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="stitch-input w-full pl-9 pr-3"
                />
              </div>
            </div>

            <div
              type="submit"
              disabled={loading}
              className="w-full h-10 rounded-lg bg-[#0F172A] hover:bg-[#1E293B] disabled:opacity-60 text-white text-[13px] font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <span>
                {loading
                  ? 'Verificando credenciales...'
                  : mode === 'login'
                    ? 'Iniciar Sesión'
                    : 'Registrar e Ingresar'}
              </span>
              <ArrowRight className="h-4 w-4" />
            </div>
          </form>

          {mode === 'login' && (
            <div className="mt-6 pt-5 border-t border-[#E2E8F0]">
              <div className="flex items-center gap-1.5 mb-2.5">
                <ShieldCheck className="h-3.5 w-3.5 text-[#2563EB]" />
                <span className="stitch-label-sm">Perfiles de Acceso</span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {ACCESS_PROFILES.map((acc) => (
                  <button
                    key={acc.email}
                    type="button"
                    onClick={() => {
                      setEmail(acc.email);
                      setPassword(acc.pass);
                      setError(null);
                    }}
                    className="flex items-center justify-between px-3 py-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-[#EFF6FF] hover:border-[#BFDBFE] text-left transition-colors cursor-pointer"
                  >
                    <div>
                      <div className="text-[12px] font-semibold text-[#0F172A]">{acc.label}</div>
                      <div className="text-[11px] text-[#64748B] tabular-metrics">{acc.email}</div>
                    </div>
                    <span className="text-[11px] font-medium text-[#2563EB]">{acc.role}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
