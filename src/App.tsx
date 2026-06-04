import type { ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { Spin } from './components/ui'
import AppLayout from './layouts/AppLayout'
import Login from './pages/Login'
import TwoFactorVerify from './pages/TwoFactorVerify'
import Dashboard from './pages/Dashboard'
import SmsGateway from './modules/SmsGateway'
import UserManagement from './pages/UserManagement'
import AuditTrail from './pages/AuditTrail'
import Notifications from './pages/Notifications'
import Webhooks from './pages/Webhooks'
import Monitoring from './pages/Monitoring'
import Incidents from './pages/Incidents'
import StatusPage from './pages/StatusPage'
import Governance from './pages/Governance'
import FeatureFlags from './pages/FeatureFlags'
import Billing from './pages/Billing'
import Reporting from './pages/Reporting'
import Partners from './pages/Partners'
import ApiCatalogue from './pages/ApiCatalogue'
import ApiProxy from './pages/ApiProxy'
import Approvals from './pages/Approvals'
import Compliance from './pages/Compliance'
import Versioning from './pages/Versioning'
import ApiChangelog from './pages/ApiChangelog'
import Testing from './pages/Testing'
import Dependencies from './pages/Dependencies'
import IceEngine from './pages/IceEngine'
import PlatformSettings from './pages/PlatformSettings'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <Spin fullscreen />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <Spin fullscreen />
  if (user) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter basename="/ui">
          <AuthProvider>
            <Routes>
              {/* Public */}
              <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
              <Route path="/2fa"   element={<TwoFactorVerify />} />

              {/* Protected — inside AppLayout */}
              <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route index element={<Dashboard />} />

                {/* API Management */}
                <Route path="proxy"         element={<ApiProxy />} />
                <Route path="iceengine"     element={<IceEngine />} />
                <Route path="catalogue"     element={<ApiCatalogue />} />

                {/* Partners */}
                <Route path="partners"      element={<Partners />} />

                {/* Communications */}
                <Route path="sms"           element={<SmsGateway />} />
                <Route path="notifications" element={<Notifications />} />
                <Route path="webhooks"      element={<Webhooks />} />

                {/* Monitoring */}
                <Route path="monitoring"    element={<Monitoring />} />
                <Route path="incidents"     element={<Incidents />} />
                <Route path="status"        element={<StatusPage />} />

                {/* Governance */}
                <Route path="governance"    element={<Governance />} />
                <Route path="flags"         element={<FeatureFlags />} />

                {/* Billing & Reports */}
                <Route path="billing"       element={<Billing />} />
                <Route path="reporting"     element={<Reporting />} />

                {/* API Tools */}
                <Route path="versioning"    element={<Versioning />} />
                <Route path="changelog"     element={<ApiChangelog />} />
                <Route path="testing"       element={<Testing />} />
                <Route path="dependencies"  element={<Dependencies />} />

                {/* Governance */}
                <Route path="compliance"    element={<Compliance />} />

                {/* Administration */}
                <Route path="users"             element={<UserManagement />} />
                <Route path="audit"             element={<AuditTrail />} />
                <Route path="approvals"         element={<Approvals />} />
                <Route path="platform-settings" element={<PlatformSettings />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
