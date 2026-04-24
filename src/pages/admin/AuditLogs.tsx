import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { FileClock, Search, ChevronDown, Download, User, Filter } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { AdminAuditLog, ACTION_LABELS, actionLabel } from '../../lib/adminAudit';

const PERIOD_OPTIONS = [
  { value: '24h', label: 'Últimas 24h', hours: 24 },
  { value: '7d', label: '7 dias', hours: 24 * 7 },
  { value: '30d', label: '30 dias', hours: 24 * 30 },
  { value: '90d', label: '90 dias', hours: 24 * 90 },
  { value: 'all', label: 'Todo o período', hours: null as number | null },
];

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function actionVariant(action: string): 'success' | 'warning' | 'error' | 'info' | 'neutral' {
  if (action.includes('suspend') || action.includes('disable') || action.includes('cancel') || action.includes('delete')) return 'error';
  if (action.includes('reactivate') || action.includes('enable') || action.includes('create')) return 'success';
  if (action.includes('plan_change') || action.includes('duplicate') || action.includes('update')) return 'info';
  if (action.includes('reset') || action.includes('extend') || action.includes('bulk')) return 'warning';
  return 'neutral';
}

export function AuditLogs() {
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState('30d');
  const [actionFilter, setActionFilter] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const opt = PERIOD_OPTIONS.find((p) => p.value === period);
      let query = supabase
        .from('admin_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (opt?.hours) {
        const since = new Date(Date.now() - opt.hours * 3600 * 1000).toISOString();
        query = query.gte('created_at', since);
      }
      const { data } = await query;
      setLogs((data || []) as AdminAuditLog[]);
      setLoading(false);
    }
    load();
  }, [period]);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (actionFilter !== 'all' && l.action !== actionFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !l.admin_email.toLowerCase().includes(q)
          && !l.target_label.toLowerCase().includes(q)
          && !l.description.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [logs, search, actionFilter]);

  function exportCsv() {
    const header = ['Data', 'Admin', 'Ação', 'Alvo', 'Descrição'];
    const rows = filtered.map((l) => [
      formatDateTime(l.created_at),
      l.admin_email,
      actionLabel(l.action),
      l.target_label,
      l.description.replace(/"/g, '""'),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${c}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auditoria-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const uniqueActions = useMemo(() => {
    const set = new Set(logs.map((l) => l.action));
    return Array.from(set).sort();
  }, [logs]);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-900 rounded-2xl flex items-center justify-center">
                <FileClock size={18} className="text-white" />
              </div>
              Logs de Auditoria
            </h1>
            <p className="text-sm text-gray-500 mt-1.5 ml-[52px]">
              Histórico completo de ações administrativas
            </p>
          </div>

          <div className="flex flex-wrap items-stretch gap-3 mb-6">
            <div className="w-full sm:flex-1 sm:min-w-[220px] sm:max-w-sm">
              <Input
                placeholder="Buscar por admin, alvo ou descrição..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                icon={<Search size={15} />}
              />
            </div>
            <SelectFilter
              value={period}
              onChange={setPeriod}
              options={PERIOD_OPTIONS.map((p) => ({ value: p.value, label: p.label }))}
            />
            <SelectFilter
              value={actionFilter}
              onChange={setActionFilter}
              options={[
                { value: 'all', label: 'Todas as ações' },
                ...uniqueActions.map((a) => ({ value: a, label: ACTION_LABELS[a] || a })),
              ]}
            />
            <button
              onClick={exportCsv}
              disabled={filtered.length === 0}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <Download size={14} />
              Exportar CSV
            </button>
          </div>

          <Card>
            {loading ? (
              <div className="space-y-2">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="h-14 bg-gray-50 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12">
                <Filter size={28} className="text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Nenhum registro encontrado.</p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-6 px-6">
                <table className="w-full text-sm min-w-[720px]">
                  <thead>
                    <tr className="text-xs text-gray-400 border-b border-gray-100">
                      <th className="text-left pb-2 font-medium">Data</th>
                      <th className="text-left pb-2 font-medium">Admin</th>
                      <th className="text-left pb-2 font-medium">Ação</th>
                      <th className="text-left pb-2 font-medium">Alvo</th>
                      <th className="text-left pb-2 font-medium">Descrição</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.map((log) => {
                      const isOpen = expanded === log.id;
                      const hasMeta = Object.keys(log.metadata || {}).length > 0;
                      return (
                        <>
                          <tr
                            key={log.id}
                            onClick={() => hasMeta && setExpanded(isOpen ? null : log.id)}
                            className={`text-gray-700 ${hasMeta ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                          >
                            <td className="py-2.5 text-xs text-gray-500 whitespace-nowrap">
                              {formatDateTime(log.created_at)}
                            </td>
                            <td className="py-2.5 text-xs">
                              <div className="flex items-center gap-1.5">
                                <User size={11} className="text-gray-400" />
                                {log.admin_email}
                              </div>
                            </td>
                            <td className="py-2.5">
                              <Badge variant={actionVariant(log.action)} size="sm">
                                {actionLabel(log.action)}
                              </Badge>
                            </td>
                            <td className="py-2.5 text-xs text-gray-600">{log.target_label || '-'}</td>
                            <td className="py-2.5 text-xs text-gray-500 max-w-sm truncate">
                              {log.description}
                            </td>
                            <td className="py-2.5 text-right">
                              {hasMeta && (
                                <ChevronDown
                                  size={14}
                                  className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                                />
                              )}
                            </td>
                          </tr>
                          {isOpen && hasMeta && (
                            <tr key={log.id + '-meta'}>
                              <td colSpan={6} className="pb-3">
                                <pre className="text-xs bg-gray-50 rounded-xl p-3 text-gray-600 overflow-x-auto">
                                  {JSON.stringify(log.metadata, null, 2)}
                                </pre>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

function SelectFilter({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none pl-3 pr-8 py-2.5 text-sm border border-gray-200 rounded-2xl bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
    </div>
  );
}
