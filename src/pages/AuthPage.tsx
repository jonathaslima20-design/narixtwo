import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, User, Brain, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { BrainLoader } from '../components/ui/BrainLoader';

export function AuthPage() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ email: '', password: '', full_name: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <BrainLoader size="lg" />
    </div>
  );
  if (user) {
    if (profile?.role === 'admin') return <Navigate to="/admin" replace />;
    return <Navigate to="/dashboard" replace />;
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      if (mode === 'register') {
        const { error } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: { data: { full_name: form.full_name, role: 'user' } },
        });
        if (error) throw error;
        navigate('/dashboard');
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password,
        });
        if (error) throw error;
        const { data: profileData } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .maybeSingle();
        navigate(profileData?.role === 'admin' ? '/admin' : '/dashboard');
      }
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'Ocorreu um erro. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-white flex">
      <div className="hidden lg:flex flex-1 bg-gray-950 items-center justify-center p-12 relative overflow-hidden">
        {/* Decorative background elements */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(255,255,255,0.06)_0%,_transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_rgba(255,255,255,0.04)_0%,_transparent_50%)]" />
        <div className="absolute top-20 left-16 w-72 h-72 rounded-full bg-white/[0.02] blur-3xl" />
        <div className="absolute bottom-20 right-16 w-56 h-56 rounded-full bg-white/[0.02] blur-3xl" />
        {/* Subtle grid */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative max-w-sm"
        >
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center ring-1 ring-white/10">
              <Brain size={20} className="text-white" />
            </div>
            <span className="text-2xl font-bold text-white tracking-tight">BrainLead</span>
          </div>
          <h2 className="text-4xl font-bold text-white mb-4 leading-[1.15] tracking-tight">
            Transforme leads em vendas reais.
          </h2>
          <p className="text-gray-400 text-base leading-relaxed">
            Organize seus contatos, gerencie conversas e dispare ofertas de forma simples e eficiente.
          </p>

          <div className="mt-10 space-y-4">
            {[
              { label: 'Chat Integrado', sub: 'Conecte seu WhatsApp e centralize sua coleta de leads.' },
              { label: 'Gestao de Funil', sub: 'Organize e categorize seus contatos conforme o momento da negociacao.' },
              { label: 'Envios Estrategicos', sub: 'Realize campanhas de massa e alcance seu publico com agilidade.' },
            ].map((feat, i) => (
              <motion.div
                key={feat.label}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.1, duration: 0.4 }}
                className="flex items-start gap-3"
              >
                <div className="w-5 h-5 bg-white/10 rounded-full flex items-center justify-center mt-0.5 shrink-0 ring-1 ring-white/10">
                  <div className="w-1.5 h-1.5 bg-white rounded-full" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{feat.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{feat.sub}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 bg-gradient-to-br from-white to-gray-50/80">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-sm"
        >
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 bg-gray-900 rounded-xl flex items-center justify-center">
              <Brain size={16} className="text-white" />
            </div>
            <span className="font-semibold text-gray-900">BrainLead</span>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-1">
            {mode === 'login' ? 'Bem-vindo de volta' : 'Criar conta'}
          </h1>
          <p className="text-sm text-gray-500 mb-8">
            {mode === 'login'
              ? 'Entre na sua conta para continuar.'
              : 'Comece a usar o BrainLead hoje.'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <AnimatePresence mode="wait">
              {mode === 'register' && (
                <motion.div
                  key="name"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Input
                    label="Nome completo"
                    name="full_name"
                    type="text"
                    value={form.full_name}
                    onChange={handleChange}
                    placeholder="Seu nome"
                    icon={<User size={15} />}
                    required
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <Input
              label="E-mail"
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              placeholder="seu@email.com"
              icon={<Mail size={15} />}
              required
            />

            <Input
              label="Senha"
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              placeholder="••••••••"
              icon={<Lock size={15} />}
              required
            />

            {error && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-xl"
              >
                {error}
              </motion.p>
            )}

            <Button type="submit" fullWidth loading={submitting} size="lg">
              {mode === 'login' ? 'Entrar' : 'Criar conta'}
              <ArrowRight size={16} />
            </Button>
          </form>

          <p className="text-sm text-gray-500 text-center mt-6">
            {mode === 'login' ? 'Não tem uma conta?' : 'Já tem uma conta?'}{' '}
            <button
              type="button"
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
              className="font-medium text-gray-900 hover:underline"
            >
              {mode === 'login' ? 'Criar conta' : 'Entrar'}
            </button>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
