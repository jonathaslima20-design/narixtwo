import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase';
import { useAuth } from './AuthContext';

export interface LeadCategoryRow {
  id: string;
  user_id: string;
  key: string;
  label: string;
  color: string;
  icon: string;
  position: number;
}

const DEFAULT_CATEGORIES: Omit<LeadCategoryRow, 'id' | 'user_id'>[] = [
  { key: 'cold', label: 'Frio', color: 'bg-sky-100 text-sky-700', icon: 'Snowflake', position: 0 },
  { key: 'warm', label: 'Morno', color: 'bg-amber-100 text-amber-700', icon: 'Thermometer', position: 1 },
  { key: 'hot', label: 'Quente', color: 'bg-red-100 text-red-700', icon: 'Flame', position: 2 },
  { key: 'closed', label: 'Fechado', color: 'bg-teal-100 text-teal-700', icon: 'Check', position: 3 },
];

export function useLeadCategories() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<LeadCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCategories = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('lead_categories')
      .select('*')
      .eq('user_id', user.id)
      .order('position', { ascending: true });

    if (data && data.length > 0) {
      setCategories(data as LeadCategoryRow[]);
    } else {
      setCategories(
        DEFAULT_CATEGORIES.map((c, i) => ({
          ...c,
          id: `default-${i}`,
          user_id: user.id,
        })),
      );
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    if (!user) return;
    const suffix = Math.random().toString(36).slice(2, 8);
    const channel = supabase
      .channel(`lead_categories_changes_${suffix}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lead_categories',
          filter: `user_id=eq.${user.id}`,
        },
        () => { fetchCategories(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchCategories]);

  const addCategory = useCallback(
    async (label: string, color: string, icon: string) => {
      if (!user) return;
      const key = label
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
      if (!key || categories.find((c) => c.key === key)) return;
      const position = categories.length;
      const { data } = await supabase
        .from('lead_categories')
        .insert({ user_id: user.id, key, label, color, icon, position })
        .select()
        .maybeSingle();
      if (data) {
        setCategories((prev) => [...prev, data as LeadCategoryRow]);
      }
    },
    [user, categories],
  );

  const deleteCategory = useCallback(
    async (key: string, migrateToKey: string) => {
      if (!user) return;
      await supabase
        .from('leads')
        .update({ category: migrateToKey, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('category', key);
      await supabase
        .from('lead_categories')
        .delete()
        .eq('user_id', user.id)
        .eq('key', key);
      const remaining = categories.filter((c) => c.key !== key);
      setCategories(remaining.map((c, i) => ({ ...c, position: i })));
      for (let i = 0; i < remaining.length; i++) {
        if (remaining[i].position !== i) {
          await supabase
            .from('lead_categories')
            .update({ position: i })
            .eq('id', remaining[i].id);
        }
      }
    },
    [user, categories],
  );

  const updateCategoryLabel = useCallback(
    async (key: string, label: string) => {
      if (!user) return;
      setCategories((prev) => prev.map((c) => (c.key === key ? { ...c, label } : c)));
      await supabase
        .from('lead_categories')
        .update({ label, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('key', key);
    },
    [user],
  );

  const updateCategoryColor = useCallback(
    async (key: string, color: string) => {
      if (!user) return;
      setCategories((prev) => prev.map((c) => (c.key === key ? { ...c, color } : c)));
      await supabase
        .from('lead_categories')
        .update({ color, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('key', key);
    },
    [user],
  );

  const updateCategoryIcon = useCallback(
    async (key: string, icon: string) => {
      if (!user) return;
      setCategories((prev) => prev.map((c) => (c.key === key ? { ...c, icon } : c)));
      await supabase
        .from('lead_categories')
        .update({ icon, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('key', key);
    },
    [user],
  );

  const reorderCategories = useCallback(
    async (reordered: LeadCategoryRow[]) => {
      if (!user) return;
      const updated = reordered.map((c, i) => ({ ...c, position: i }));
      setCategories(updated);
      for (const c of updated) {
        await supabase
          .from('lead_categories')
          .update({ position: c.position, updated_at: new Date().toISOString() })
          .eq('id', c.id);
      }
    },
    [user],
  );

  const resetToDefaults = useCallback(async () => {
    if (!user) return;
    await supabase.from('lead_categories').delete().eq('user_id', user.id);
    const rows = DEFAULT_CATEGORIES.map((c) => ({
      user_id: user.id,
      key: c.key,
      label: c.label,
      color: c.color,
      icon: c.icon,
      position: c.position,
    }));
    await supabase.from('lead_categories').insert(rows);
    await fetchCategories();
  }, [user, fetchCategories]);

  const getLabelForKey = useCallback(
    (key: string): string => {
      return categories.find((c) => c.key === key)?.label ?? key;
    },
    [categories],
  );

  const getColorForKey = useCallback(
    (key: string): string => {
      return categories.find((c) => c.key === key)?.color ?? 'bg-gray-100 text-gray-700';
    },
    [categories],
  );

  const getIconForKey = useCallback(
    (key: string): string => {
      return categories.find((c) => c.key === key)?.icon ?? 'CircleDot';
    },
    [categories],
  );

  return {
    categories,
    loading,
    addCategory,
    deleteCategory,
    updateCategoryLabel,
    updateCategoryColor,
    updateCategoryIcon,
    reorderCategories,
    resetToDefaults,
    getLabelForKey,
    getColorForKey,
    getIconForKey,
    refetch: fetchCategories,
  };
}
