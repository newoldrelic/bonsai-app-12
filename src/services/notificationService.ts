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
        this.serviceWorkerRegistration = await navigator.serviceWorker.register('/notification-worker.js');
        debug.info('Service Worker registered');

        // Wait for the service worker to be ready
        await navigator.serviceWorker.ready;
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
      await this.ensureInitialized();

      // Always try to request permission first
      const permission = await Notification.requestPermission();
      return permission === 'granted';
      
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

      // Request permission if not already granted
      const permissionGranted = await this.requestPermission();
      if (!permissionGranted) {
        throw new Error('Notification permission denied');
      }

      const schedule = MAINTENANCE_SCHEDULES[type];
      const lastDate = lastPerformed ? new Date(lastPerformed) : new Date();
      
      // Calculate next notification time using tree's notification settings or default to 9 AM
      const hours = notificationTime?.hours ?? 9;
      const minutes = notificationTime?.minutes ?? 0;
      
      // Calculate next notification time
      let nextDate = addDays(lastDate, schedule.interval / (24 * 60 * 60 * 1000));
      nextDate = setHours(nextDate, hours);
      nextDate = setMinutes(nextDate, minutes);

      // If calculated time is in past, add interval
      if (nextDate < new Date()) {
        nextDate = addDays(nextDate, schedule.interval / (24 * 60 * 60 * 1000));
      }

      const timeUntilNotification = nextDate.getTime() - Date.now();

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