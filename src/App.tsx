import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { Dashboard } from './components/Dashboard';
import { Header } from './components/Header';
import { MaintenanceView } from './components/MaintenanceView';
import { HistoryView } from './components/HistoryView';
import { StyleGuide } from './components/StyleGuide';
import { TreeDetails } from './components/TreeDetails';
import { PricingPage } from './pages/PricingPage';
import { SubscriptionSuccessPage } from './pages/SubscriptionSuccessPage';
import { AuthError } from './components/AuthError';
import { CookieConsent } from './components/CookieConsent';
import { useAuthStore } from './store/authStore';
import { useSubscriptionStore } from './store/subscriptionStore';
import { SpeciesIdentifierPage } from './pages/SpeciesIdentifierPage';
import { HealthAnalyticsPage } from './pages/HealthAnalyticsPage';
import { CareGuidePage } from './pages/CareGuidePage';
import { ExpertCoachingPage } from './pages/ExpertCoachingPage';
import { logAnalyticsEvent } from './config/firebase';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-bonsai-green border-t-transparent"></div>
      </div>
    );
  }

  if (!user) {
    logAnalyticsEvent('unauthorized_access_attempt');
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function PremiumRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore();
  const { getCurrentPlan } = useSubscriptionStore();
  const currentPlan = getCurrentPlan();
  const isSubscribed = currentPlan !== 'hobby';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-bonsai-green border-t-transparent"></div>
      </div>
    );
  }

  if (!user || !isSubscribed) {
    logAnalyticsEvent('premium_access_attempt');
    return <Navigate to="/pricing" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  const { loading } = useAuthStore();

  React.useEffect(() => {
    logAnalyticsEvent('app_loaded');
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-bonsai-green border-t-transparent"></div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen">
        <Header />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/success" element={<SubscriptionSuccessPage />} />
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } />
          <Route path="/tree/:id" element={
            <ProtectedRoute>
              <TreeDetails />
            </ProtectedRoute>
          } />
          <Route path="/maintenance" element={
            <ProtectedRoute>
              <MaintenanceView />
            </ProtectedRoute>
          } />
          <Route path="/history" element={
            <ProtectedRoute>
              <HistoryView />
            </ProtectedRoute>
          } />
          <Route path="/guide" element={
            <ProtectedRoute>
              <StyleGuide />
            </ProtectedRoute>
          } />
          <Route path="/species-identifier" element={
            <PremiumRoute>
              <SpeciesIdentifierPage />
            </PremiumRoute>
          } />
          <Route path="/health-analytics" element={
            <PremiumRoute>
              <HealthAnalyticsPage />
            </PremiumRoute>
          } />
          <Route path="/care-guide" element={
            <PremiumRoute>
              <CareGuidePage />
            </PremiumRoute>
          } />
          <Route path="/expert-coaching" element={
            <PremiumRoute>
              <ExpertCoachingPage />
            </PremiumRoute>
          } />
        </Routes>
        <AuthError />
        <CookieConsent />
      </div>
    </BrowserRouter>
  );
}