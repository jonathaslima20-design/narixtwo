import { useCallback } from 'react';
import { supabase } from './supabase';
import { SubscriptionStatus } from './types';

export function useClientSubscriptions() {
  const updateSubscriptionPlan = useCallback(async (userId: string, planId: string) => {
    const { error } = await supabase
      .from('client_subscriptions')
      .update({
        plan_id: planId,
        status: 'active' as SubscriptionStatus,
        started_at: new Date().toISOString(),
        cancelled_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
    if (error) throw error;
  }, []);

  const cancelSubscription = useCallback(async (userId: string) => {
    const { error } = await supabase
      .from('client_subscriptions')
      .update({
        status: 'cancelled' as SubscriptionStatus,
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
    if (error) throw error;
  }, []);

  const reactivateSubscription = useCallback(async (userId: string) => {
    const { error } = await supabase
      .from('client_subscriptions')
      .update({
        status: 'active' as SubscriptionStatus,
        cancelled_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
    if (error) throw error;
  }, []);

  const extendExpiry = useCallback(async (userId: string, expiresAt: string) => {
    const { error } = await supabase
      .from('client_subscriptions')
      .update({
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
    if (error) throw error;
  }, []);

  const updateNotes = useCallback(async (userId: string, notes: string) => {
    const { error } = await supabase
      .from('client_subscriptions')
      .update({
        notes,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
    if (error) throw error;
  }, []);

  const suspendSubscription = useCallback(async (userId: string) => {
    const { error } = await supabase
      .from('client_subscriptions')
      .update({
        status: 'suspended' as SubscriptionStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
    if (error) throw error;
  }, []);

  return {
    updateSubscriptionPlan,
    cancelSubscription,
    reactivateSubscription,
    extendExpiry,
    updateNotes,
    suspendSubscription,
  };
}
