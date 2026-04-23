import {
  Snowflake,
  Thermometer,
  Flame,
  Check,
  Star,
  Target,
  Clock,
  Heart,
  Zap,
  Shield,
  Award,
  TrendingUp,
  Handshake,
  ThumbsUp,
  CircleDot,
  type LucideIcon,
} from 'lucide-react';

export const ICON_OPTIONS: { name: string; component: LucideIcon }[] = [
  { name: 'Snowflake', component: Snowflake },
  { name: 'Thermometer', component: Thermometer },
  { name: 'Flame', component: Flame },
  { name: 'Check', component: Check },
  { name: 'Star', component: Star },
  { name: 'Target', component: Target },
  { name: 'Clock', component: Clock },
  { name: 'Heart', component: Heart },
  { name: 'Zap', component: Zap },
  { name: 'Shield', component: Shield },
  { name: 'Award', component: Award },
  { name: 'TrendingUp', component: TrendingUp },
  { name: 'Handshake', component: Handshake },
  { name: 'ThumbsUp', component: ThumbsUp },
  { name: 'CircleDot', component: CircleDot },
];

const iconMap: Record<string, LucideIcon> = {};
for (const opt of ICON_OPTIONS) {
  iconMap[opt.name] = opt.component;
}

export function resolveIcon(name: string): LucideIcon {
  return iconMap[name] || CircleDot;
}
