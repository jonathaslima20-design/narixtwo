import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase';
import { Plan } from './types';

export function usePlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPlans = useCallback(async () => {
    const { data } = await supabase
      .from('plans')
      .select('*')
      .order('sort_order', { ascending: true });
    if (data) setPlans(data as Plan[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  useEffect(() => {
    const channel = supabase
      .channel('plans-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'plans' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setPlans((prev) => [...prev, payload.new as Plan].sort((a, b) => a.sort_order - b.sort_order));
          } else if (payload.eventType === 'UPDATE') {
            setPlans((prev) =>
              prev.map((p) => (p.id === (payload.new as Plan).id ? (payload.new as Plan) : p))
                .sort((a, b) => a.sort_order - b.sort_order),
            );
          } else if (payload.eventType === 'DELETE') {
            setPlans((prev) => prev.filter((p) => p.id !== (payload.old as { id: string }).id));
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const createPlan = useCallback(async (plan: Omit<Plan, 'id' | 'created_at' | 'updated_at'>) => {
    const { error } = await supabase.from('plans').insert(plan);
    if (error) throw error;
  }, []);

  const updatePlan = useCallback(async (id: string, updates: Partial<Plan>) => {
    const { error } = await supabase
      .from('plans')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }, []);

  const deletePlan = useCallback(async (id: string) => {
    const { error } = await supabase.from('plans').delete().eq('id', id);
    if (error) throw error;
    setPlans((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const togglePlanActive = useCallback(async (id: string, is_active: boolean) => {
    const { error } = await supabase
      .from('plans')
      .update({ is_active, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }, []);

  return { plans, loading, fetchPlans, createPlan, updatePlan, deletePlan, togglePlanActive };
}
