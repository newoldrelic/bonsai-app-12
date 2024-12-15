import { debug } from '../utils/debug';
import { MAINTENANCE_SCHEDULES } from '../config/maintenance';
import type { MaintenanceType } from '../types';
import { addDays, setHours, setMinutes } from 'date-fns';

class NotificationService {
  private notificationTimers: Record<string, NodeJS.Timeout> = {};
  private serviceWorkerRegistration: ServiceWorkerRegistration | null = null;
  private initialized = false;
  private initializationError: Error | null = null;

  async init(): Promise<void> {
    if (this.initialized) return;
    
    if (!('Notification' in window)) {
      this.initializationError = new Error('This browser does not support notifications');
      throw this.initializationError;
    }
  
    try {
      // Register service worker if not already registered
      if ('serviceWorker' in navigator) {
        // Check if we already have a registration
        const existingRegistration = await navigator.serviceWorker.getRegistration('/notification-worker.js');
        
        if (existingRegistration) {
          this.serviceWorkerRegistration = existingRegistration;
          debug.info('Using existing Service Worker registration');
        } else {
          this.serviceWorkerRegistration = await navigator.serviceWorker.register('/notification-worker.js');
          debug.info('New Service Worker registered');
        }
  
        // Wait for the service worker to be ready
        await navigator.serviceWorker.ready;
        debug.info('Service Worker is ready');
      }
  
      this.initialized = true;
      this.initializationError = null;
      debug.info('Notification service initialized successfully');
    } catch (error) {
      this.initializationError = error instanceof Error ? error : new Error('Unknown error');
      debug.error('Failed to initialize notification service:', error);
      throw this.initializationError;
    }
  }

  async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      if (this.initializationError) {
        throw this.initializationError;
      }
      await this.init();
    }
  }

  async requestPermission(): Promise<boolean> {
    try {
      // Check current permission state
      if (Notification.permission === 'granted') {
        return true;
      }
      
      // Request permission only if not already denied
      if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
      }
      
      return false;
    } catch (error) {
      debug.error('Failed to request notification permission:', error);
      return false;
    }
  }

  async updateMaintenanceSchedule(
    treeId: string,
    treeName: string,
    type: MaintenanceType,
    enabled: boolean,
    lastPerformed?: string,
    notificationTime?: { hours: number; minutes: number }
  ): Promise<void> {
    try {
      await this.ensureInitialized();
      
      const key = `${treeId}-${type}`;

      // Clear existing timer
      if (this.notificationTimers[key]) {
        clearTimeout(this.notificationTimers[key]);
        delete this.notificationTimers[key];
      }

      if (!enabled) {
        debug.info(`Notifications disabled for ${treeName} - ${type}`);
        return;
      }

      if (Notification.permission !== 'granted') {
        throw new Error('Notification permission required');
      }

      const schedule = MAINTENANCE_SCHEDULES[type];
      
      // Calculate base date - if never performed, start scheduling from now
      let baseDate = lastPerformed ? new Date(lastPerformed) : new Date();
      
      // For new tasks without lastPerformed, set base date to now minus one interval
      // This prevents immediate notification
      if (!lastPerformed) {
        baseDate = new Date(baseDate.getTime() - schedule.interval);
      }
      
      const hours = notificationTime?.hours ?? 9;
      const minutes = notificationTime?.minutes ?? 0;
      
      // Calculate next notification time
      let nextDate = addDays(baseDate, schedule.interval / (24 * 60 * 60 * 1000));
      nextDate = setHours(nextDate, hours);
      nextDate = setMinutes(nextDate, minutes);

      // If calculated time is in past, add intervals until we reach future time
      while (nextDate < new Date()) {
        nextDate = addDays(nextDate, schedule.interval / (24 * 60 * 60 * 1000));
      }

      const timeUntilNotification = nextDate.getTime() - Date.now();

      debug.info(`Scheduling notification:`, {
        type,
        treeName,
        lastPerformed: lastPerformed || 'never',
        nextDate: nextDate.toISOString(),
        timeUntil: `${Math.round(timeUntilNotification / (1000 * 60 * 60))} hours`
      });

      // Schedule notification
      this.notificationTimers[key] = setTimeout(async () => {
        try {
          if (this.serviceWorkerRegistration) {
            await this.serviceWorkerRegistration.showNotification(`Bonsai Maintenance: ${treeName}`, {
              body: schedule.message,
              icon: '/bonsai-icon.png',
              tag: key,
              requireInteraction: true,
              data: { treeId, type },
              actions: [
                { action: 'done', title: 'Mark as Done' },
                { action: 'snooze', title: 'Snooze 1hr' }
              ]
            });
          } else {
            new Notification(`Bonsai Maintenance: ${treeName}`, {
              body: schedule.message,
              icon: '/bonsai-icon.png',
              tag: key
            });
          }

          // Schedule next notification
          this.updateMaintenanceSchedule(
            treeId, 
            treeName, 
            type, 
            true, 
            nextDate.toISOString(),
            { hours, minutes }
          );
        } catch (error) {
          debug.error('Failed to show notification:', error);
        }
      }, Math.max(0, timeUntilNotification));

      debug.info(`Scheduled ${type} notification for ${treeName} at ${nextDate.toISOString()}`);
    } catch (error) {
      debug.error('Error updating maintenance schedule:', error);
      throw error;
    }
  }

  private clearAllTimers(): void {
    Object.values(this.notificationTimers).forEach(timer => clearTimeout(timer));
    this.notificationTimers = {};
  }
}

export const notificationService = new NotificationService();