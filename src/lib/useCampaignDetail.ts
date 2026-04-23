import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from './supabase';
import { Campaign, CampaignRecipient } from './types';

export function useCampaignDetail(campaignId: string | undefined, userId: string | undefined) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [recipients, setRecipients] = useState<CampaignRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const sendingRef = useRef(false);

  const fetchCampaign = useCallback(async () => {
    if (!campaignId) return;
    const { data } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .maybeSingle();
    if (data) setCampaign(data as Campaign);
  }, [campaignId]);

  const fetchRecipients = useCallback(async () => {
    if (!campaignId) return;
    const { data } = await supabase
      .from('campaign_recipients')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: true });
    if (data) setRecipients(data as CampaignRecipient[]);
    setLoading(false);
  }, [campaignId]);

  useEffect(() => {
    fetchCampaign();
    fetchRecipients();
  }, [fetchCampaign, fetchRecipients]);

  // Realtime for campaign counter updates
  useEffect(() => {
    if (!campaignId) return;
    const channel = supabase
      .channel(`campaign-detail-${campaignId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'campaigns',
          filter: `id=eq.${campaignId}`,
        },
        (payload) => {
          setCampaign(payload.new as Campaign);
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'campaign_recipients',
          filter: `campaign_id=eq.${campaignId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setRecipients((prev) => [...prev, payload.new as CampaignRecipient]);
          } else if (payload.eventType === 'UPDATE') {
            setRecipients((prev) =>
              prev.map((r) =>
                r.id === (payload.new as CampaignRecipient).id
                  ? (payload.new as CampaignRecipient)
                  : r,
              ),
            );
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [campaignId]);

  const startSending = useCallback(async (): Promise<string | null> => {
    if (!campaignId || !userId || sendingRef.current) return null;
    sendingRef.current = true;

    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/campaign-send`;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

    const send = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada. Faça login novamente.');

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          apikey: anonKey,
        },
        body: JSON.stringify({ campaign_id: campaignId }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (json as Record<string, unknown>)?.error;
        throw new Error(typeof msg === 'string' ? msg : `Erro ${res.status} ao enviar campanha`);
      }
      return json as Record<string, unknown>;
    };

    try {
      let result = await send();
      while (result && !result.completed && (result.remaining as number) > 0 && !result.error) {
        const { data: fresh } = await supabase
          .from('campaigns')
          .select('status')
          .eq('id', campaignId)
          .maybeSingle();
        if (!fresh || fresh.status === 'paused' || fresh.status === 'cancelled') break;
        result = await send();
      }
      if (result?.error) {
        return result.error as string;
      }
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'Erro desconhecido ao enviar campanha';
    } finally {
      sendingRef.current = false;
      await fetchCampaign();
      await fetchRecipients();
    }
  }, [campaignId, userId, fetchCampaign, fetchRecipients]);

  return { campaign, recipients, loading, fetchCampaign, fetchRecipients, startSending };
}
