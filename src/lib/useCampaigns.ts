import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase';
import { Campaign, CampaignStatus } from './types';

export function useCampaigns(userId: string | undefined) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCampaigns = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('campaigns')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (data) setCampaigns(data as Campaign[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel('campaigns-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'campaigns',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setCampaigns((prev) => [payload.new as Campaign, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setCampaigns((prev) =>
              prev.map((c) => (c.id === (payload.new as Campaign).id ? (payload.new as Campaign) : c)),
            );
          } else if (payload.eventType === 'DELETE') {
            setCampaigns((prev) => prev.filter((c) => c.id !== (payload.old as { id: string }).id));
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const deleteCampaign = useCallback(async (id: string) => {
    const { error } = await supabase.from('campaigns').delete().eq('id', id);
    if (error) throw error;
    setCampaigns((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const updateStatus = useCallback(async (id: string, status: CampaignStatus) => {
    const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (status === 'cancelled') update.cancelled_at = new Date().toISOString();
    await supabase.from('campaigns').update(update).eq('id', id);
  }, []);

  return { campaigns, loading, fetchCampaigns, deleteCampaign, updateStatus };
}
