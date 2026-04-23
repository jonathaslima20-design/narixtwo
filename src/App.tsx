import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/AuthContext';
import { AuthPage } from './pages/AuthPage';
import { UserLayout } from './components/layout/UserLayout';
import { AdminLayout } from './components/layout/AdminLayout';
import { DashboardHome } from './pages/dashboard/DashboardHome';
import { Leads } from './pages/dashboard/Leads';
import { LeadManagement } from './pages/dashboard/LeadManagement';
import { Settings } from './pages/dashboard/Settings';
import { Campaigns } from './pages/dashboard/Campaigns';
import { CampaignBuilder } from './pages/dashboard/CampaignBuilder';
import { CampaignDetail } from './pages/dashboard/CampaignDetail';
import { AdminOverview } from './pages/admin/AdminOverview';
import { ClientManagement } from './pages/admin/ClientManagement';
import { PlanManagement } from './pages/admin/PlanManagement';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<AuthPage />} />

          <Route path="/dashboard" element={<UserLayout />}>
            <Route index element={<DashboardHome />} />
            <Route path="leads" element={<Leads />} />
            <Route path="crm" element={<LeadManagement />} />
            <Route path="settings" element={<Settings />} />
            <Route path="campaigns" element={<Campaigns />} />
            <Route path="campaigns/new" element={<CampaignBuilder />} />
            <Route path="campaigns/:id" element={<CampaignDetail />} />
          </Route>

          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminOverview />} />
            <Route path="plans" element={<PlanManagement />} />
            <Route path="clients" element={<ClientManagement />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
