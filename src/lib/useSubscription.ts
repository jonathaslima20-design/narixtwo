import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from './supabase';
import { useAuth } from './AuthContext';
import { ClientSubscription, Plan } from './types';

interface SubscriptionState {
  subscription: ClientSubscription | null;
  plan: Plan | null;
  loading: boolean;
  isBlocked: boolean;
  isTrial: boolean;
  remainingSends: number;
  daysLeft: number;
  sendCount: number;
  incrementSendCount: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useSubscription(): SubscriptionState {
  const { user, profile } = useAuth();
  const [subscription, setSubscription] = useState<ClientSubscription | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSubscription = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from('client_subscriptions')
      .select('*, plans(*)')
      .eq('user_id', user.id)
      .maybeSingle();

    if (data) {
      const p = data.plans as unknown as Plan | null;
      setPlan(p ?? null);
      setSubscription({
        id: data.id,
        user_id: data.user_id,
        plan_id: data.plan_id,
        status: data.status,
        started_at: data.started_at,
        expires_at: data.expires_at,
        cancelled_at: data.cancelled_at,
        send_count: data.send_count ?? 0,
        notes: data.notes,
        created_at: data.created_at,
        updated_at: data.updated_at,
        plan: p ?? undefined,
      });
    } else {
      setSubscription(null);
      setPlan(null);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('user-subscription')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'client_subscriptions', filter: `user_id=eq.${user.id}` },
        () => { fetchSubscription(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchSubscription]);

  const isTrial = subscription?.status === 'trial';

  const sendCount = subscription?.send_count ?? 0;

  const maxSends = plan?.max_sends ?? -1;

  const remainingSends = maxSends === -1 ? Infinity : Math.max(0, maxSends - sendCount);

  const daysLeft = useMemo(() => {
    if (!subscription?.expires_at) return Infinity;
    const diff = new Date(subscription.expires_at).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }, [subscription?.expires_at]);

  const isBlocked = useMemo(() => {
    if (profile?.is_enabled === false) return true;
    if (!subscription) return false;
    const status = subscription.status;
    if (status === 'cancelled' || status === 'suspended') return true;
    if (isTrial) {
      if (daysLeft <= 0) return true;
      if (maxSends !== -1 && sendCount >= maxSends) return true;
    }
    if (subscription.expires_at && new Date(subscription.expires_at) < new Date()) return true;
    return false;
  }, [profile, subscription, isTrial, daysLeft, sendCount, maxSends]);

  const incrementSendCount = useCallback(async () => {
    if (!user || !subscription) return;
    const newCount = sendCount + 1;
    await supabase
      .from('client_subscriptions')
      .update({ send_count: newCount, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);
    setSubscription((prev) => prev ? { ...prev, send_count: newCount } : prev);
  }, [user, subscription, sendCount]);

  return {
    subscription,
    plan,
    loading,
    isBlocked,
    isTrial,
    remainingSends,
    daysLeft,
    sendCount,
    incrementSendCount,
    refresh: fetchSubscription,
  };
}
