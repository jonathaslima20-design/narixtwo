import { useState } from 'react';
import { motion } from 'framer-motion';
import { Settings as SettingsIcon, Smartphone, Layers } from 'lucide-react';
import { ConnectWhatsApp } from './ConnectWhatsApp';
import { CategorySettings } from './CategorySettings';

const tabs = [
  { id: 'connections', label: 'Conexoes', icon: Smartphone },
  { id: 'categories', label: 'Categorias', icon: Layers },
] as const;

type TabId = (typeof tabs)[number]['id'];

export function Settings() {
  const [activeTab, setActiveTab] = useState<TabId>('connections');

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-8">
            <div className="flex items-center gap-2.5 mb-1">
              <SettingsIcon size={22} className="text-gray-400" />
              <h1 className="text-2xl font-bold text-gray-900">Configuracoes</h1>
            </div>
            <p className="text-sm text-gray-500">
              Gerencie suas conexoes e personalize as categorias do seu funil.
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl w-fit mb-6 sm:mb-8 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 ${
                    isActive ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="settings-tab-bg"
                      className="absolute inset-0 bg-white rounded-lg shadow-sm"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative flex items-center gap-2">
                    <Icon size={15} />
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>
        </motion.div>

        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'connections' && <ConnectWhatsApp embedded />}
          {activeTab === 'categories' && <CategorySettings embedded />}
        </motion.div>
      </div>
    </div>
  );
}
