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
        } else {
          this.serviceWorkerRegistration = await navigator.serviceWorker.register('/notification-worker.js');
        }
  
        await navigator.serviceWorker.ready;
      }
  
      this.initialized = true;
      this.initializationError = null;
    } catch (error) {
      this.initializationError = error instanceof Error ? error : new Error('Unknown error');
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

  private async showNotification(title: string, options: NotificationOptions = {}): Promise<void> {
    try {
      // Try service worker first
      if (this.serviceWorkerRegistration) {
        await this.serviceWorkerRegistration.showNotification(title, {
          ...options,
          requireInteraction: true,
          silent: false
        });
        return;
      }

      // Fallback to basic notification
      new Notification(title, {
        ...options,
        requireInteraction: true
      });
    } catch (error) {
      debug.error('Failed to show notification:', error);
      // Try basic notification as last resort
      try {
        new Notification(title, options);
      } catch (secondError) {
        throw error; // Throw original error if both methods fail
      }
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
      console.log('Starting notification schedule update:', {
        treeId,
        treeName,
        type,
        enabled,
        lastPerformed,
        notificationTime
      });

      await this.ensureInitialized();
      
      const key = `${treeId}-${type}`;

      // Clear existing timer
      if (this.notificationTimers[key]) {
        console.log('Clearing existing timer for:', key);
        clearTimeout(this.notificationTimers[key]);
        delete this.notificationTimers[key];
      }

      if (!enabled) {
        console.log('Notifications disabled for:', key);
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

      console.log('Notification timing calculated:', {
        baseDate: baseDate.toISOString(),
        nextDate: nextDate.toISOString(),
        timeUntilNotification: `${Math.floor(timeUntilNotification / (1000 * 60 * 60))}h ${Math.floor((timeUntilNotification % (1000 * 60 * 60)) / (1000 * 60))}m`,
        notificationTime
      });

      // Safeguard against immediate or past notifications
      if (timeUntilNotification <= 1000) {
        console.log('Adjusting schedule to prevent immediate notification');
        nextDate = new Date(nextDate.getTime() + schedule.interval);
      }

      // Schedule notification
      this.notificationTimers[key] = setTimeout(async () => {
        try {
          console.log('Timer fired for:', key);
          const actualDelay = new Date().getTime() - now.getTime();
          
          // Prevent early firing
          if (actualDelay < timeUntilNotification - 1000) {
            console.log('Preventing early notification:', key);
            return;
          }

          console.log('Attempting to show notification for:', key);
          await this.showNotification(`Bonsai Maintenance: ${treeName}`, {
            body: schedule.message,
            icon: '/bonsai-icon.png',
            tag: key,
            data: { treeId, type },
            actions: [
              { action: 'done', title: 'Mark as Done' },
              { action: 'snooze', title: 'Snooze 1hr' }
            ]
          });

          // Schedule next notification
          await this.updateMaintenanceSchedule(
            treeId, 
            treeName, 
            type, 
            true, 
            nextDate.toISOString(),
            { hours: nextDate.getHours(), minutes: nextDate.getMinutes() }
          );
        } catch (error) {
          console.error('Failed to show notification:', error);
        }
      }, timeUntilNotification);

      console.log('Notification scheduled:', {
        key,
        nextDate: nextDate.toISOString(),
        timeUntil: `${Math.floor(timeUntilNotification / (1000 * 60 * 60))}h ${Math.floor((timeUntilNotification % (1000 * 60 * 60)) / (1000 * 60))}m`
      });
    } catch (error) {
      console.error('Error updating maintenance schedule:', error);
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

      await this.showNotification('Bonsai Care Test Notification', {
        body: 'If you see this, notifications are working correctly!',
        icon: '/bonsai-icon.png',
        tag: 'test',
        requireInteraction: true,
        data: { test: true }
      });
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