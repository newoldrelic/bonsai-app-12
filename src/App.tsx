import React, { useEffect } from 'react';
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
import { useBonsaiStore } from './store/bonsaiStore';
import { SpeciesIdentifierPage } from './pages/SpeciesIdentifierPage';
import { HealthAnalyticsPage } from './pages/HealthAnalyticsPage';
import { CareGuidePage } from './pages/CareGuidePage';
import { ExpertCoachingPage } from './pages/ExpertCoachingPage';
import { VoiceChatPage } from './pages/VoiceChatPage';
import { logAnalyticsEvent } from './config/firebase';
import { debug } from './utils/debug';
import { registerServiceWorker } from './utils/notifications';

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

  // Register service worker early
  useEffect(() => {
    registerServiceWorker().catch(error => {
      debug.error('Failed to register service worker:', error);
    });
  }, []);

  // Set up message listener for maintenance tasks
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'MAINTENANCE_DONE') {
        const { data, notificationTag } = event.data;
        if (data?.treeId && data?.type) {
          try {
            // Add maintenance log for the completed task
            const log = {
              type: data.type,
              date: new Date().toISOString(),
              notes: 'Marked as done from notification',
              images: []
            };
            await useBonsaiStore.getState().addMaintenanceLog(data.treeId, log);
            debug.info('Maintenance task completed:', { treeId: data.treeId, type: data.type });
          } catch (error) {
            debug.error('Failed to log maintenance completion:', error);
          }
        }
      }
    };

    navigator.serviceWorker?.addEventListener('message', handleMessage);
    return () => {
      navigator.serviceWorker?.removeEventListener('message', handleMessage);
    };
  }, []);

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
          <Route path="/voice-chat" element={
            <PremiumRoute>
              <VoiceChatPage />
            </PremiumRoute>
          } />
        </Routes>
        <AuthError />
        <CookieConsent />
      </div>
    </BrowserRouter>
  );
}