import { Brain } from 'lucide-react';

const sizes = {
  sm: { container: 'w-8 h-8 rounded-xl', icon: 16 },
  md: { container: 'w-10 h-10 rounded-xl', icon: 20 },
  lg: { container: 'w-14 h-14 rounded-2xl', icon: 28 },
};

interface Props {
  size?: keyof typeof sizes;
}

export function BrainLoader({ size = 'md' }: Props) {
  const s = sizes[size];
  return (
    <div className={`${s.container} bg-gray-900 flex items-center justify-center animate-brain-pulse`}>
      <Brain size={s.icon} className="text-white" />
    </div>
  );
}
