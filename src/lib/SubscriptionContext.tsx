import { createContext, useContext, ReactNode } from 'react';
import { useSubscription } from './useSubscription';
import { ClientSubscription, Plan } from './types';

interface SubscriptionContextType {
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

const SubscriptionContext = createContext<SubscriptionContextType>({
  subscription: null,
  plan: null,
  loading: true,
  isBlocked: false,
  isTrial: false,
  remainingSends: Infinity,
  daysLeft: Infinity,
  sendCount: 0,
  incrementSendCount: async () => {},
  refresh: async () => {},
});

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const sub = useSubscription();
  return (
    <SubscriptionContext.Provider value={sub}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscriptionCtx() {
  return useContext(SubscriptionContext);
}
