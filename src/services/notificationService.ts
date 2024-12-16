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
        const existingRegistration = await navigator.serviceWorker.getRegistration('/notification-worker.js');
        
        if (existingRegistration) {
          this.serviceWorkerRegistration = existingRegistration;
          debug.info('Using existing Service Worker registration');
        } else {
          this.serviceWorkerRegistration = await navigator.serviceWorker.register('/notification-worker.js');
          debug.info('New Service Worker registered');
        }
  
        await navigator.serviceWorker.ready;
      }
  
      this.initialized = true;
      this.initializationError = null;
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
      if (Notification.permission === 'granted') {
        return true;
      }
      
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
        return;
      }

      if (Notification.permission !== 'granted') {
        throw new Error('Notification permission required');
      }

      const schedule = MAINTENANCE_SCHEDULES[type];
      const now = new Date();
      
      // Set up initial date calculations
      let baseDate;
      if (lastPerformed) {
        baseDate = new Date(lastPerformed);
      } else {
        baseDate = new Date();
        baseDate.setHours(notificationTime?.hours ?? 9);
        baseDate.setMinutes(notificationTime?.minutes ?? 0);
        baseDate.setSeconds(0);
        baseDate.setMilliseconds(0);
        
        // Move back one interval to ensure first notification isn't immediate
        baseDate.setTime(baseDate.getTime() - schedule.interval);
      }

      // Calculate next notification time
      let nextDate = new Date(baseDate.getTime() + schedule.interval);
      nextDate.setHours(notificationTime?.hours ?? 9);
      nextDate.setMinutes(notificationTime?.minutes ?? 0);
      nextDate.setSeconds(0);
      nextDate.setMilliseconds(0);

      // If next date is in the past, add intervals until we reach a future time
      while (nextDate <= now) {
        nextDate.setTime(nextDate.getTime() + schedule.interval);
      }

      const timeUntilNotification = nextDate.getTime() - now.getTime();

      // Safeguard against immediate or past notifications
      if (timeUntilNotification <= 1000) { // Less than 1 second
        nextDate = new Date(nextDate.getTime() + schedule.interval);
      }

      // Schedule notification
      this.notificationTimers[key] = setTimeout(async () => {
        try {
          const actualDelay = new Date().getTime() - now.getTime();
          
          // Prevent early firing
          if (actualDelay < timeUntilNotification - 1000) {
            return;
          }

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
            { hours: nextDate.getHours(), minutes: nextDate.getMinutes() }
          );
        } catch (error) {
          debug.error('Failed to show notification:', error);
        }
      }, timeUntilNotification);
    } catch (error) {
      debug.error('Error updating maintenance schedule:', error);
      throw error;
    }
  }

  async testNotification(): Promise<void> {
    try {
      await this.ensureInitialized();
      
      if (Notification.permission !== 'granted') {
        const permission = await this.requestPermission();
        if (!permission) {
          throw new Error('Notification permission not granted');
        }
      }

      if (this.serviceWorkerRegistration) {
        await this.serviceWorkerRegistration.showNotification('Bonsai Care Test Notification', {
          body: 'If you see this, notifications are working correctly!',
          icon: '/bonsai-icon.png',
          tag: 'test',
          requireInteraction: true,
          data: { test: true }
        });
      } else {
        new Notification('Bonsai Care Test Notification', {
          body: 'If you see this, notifications are working correctly!',
          icon: '/bonsai-icon.png'
        });
      }
    } catch (error) {
      debug.error('Test notification failed:', error);
      throw error;
    }
  }

  async testScheduledNotification(): Promise<void> {
    try {
      await this.updateMaintenanceSchedule(
        'test-tree',
        'Test Tree',
        'pruning',
        true,
        undefined,
        { 
          hours: new Date().getHours(),
          minutes: new Date().getMinutes() + 1 
        }
      );
    } catch (error) {
      debug.error('Test scheduled notification failed:', error);
      throw error;
    }
  }

  private clearAllTimers(): void {
    Object.values(this.notificationTimers).forEach(timer => clearTimeout(timer));
    this.notificationTimers = {};
  }
}

export const notificationService = new NotificationService();