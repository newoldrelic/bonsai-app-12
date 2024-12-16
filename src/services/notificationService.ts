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
    debug.info('Initializing notification service', {
      hasNotification: 'Notification' in window,
      hasServiceWorker: 'serviceWorker' in navigator,
      permission: Notification.permission
    });

    if (this.initialized) {
      debug.info('Notification service already initialized');
      return;
    }
    
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

  async showNotification(title: string, options: { body: string; tag: string }): Promise<void> {
    try {
      await this.ensureInitialized();
      
      if (this.serviceWorkerRegistration) {
        await this.serviceWorkerRegistration.showNotification(title, {
          ...options,
          icon: '/bonsai-icon.png',
          requireInteraction: true
        });
      } else {
        new Notification(title, {
          ...options,
          icon: '/bonsai-icon.png'
        });
      }
    } catch (error) {
      debug.error('Failed to show debug notification:', error);
      throw error;
    }
  }

  async requestPermission(): Promise<boolean> {
    try {
      debug.info('Requesting notification permission');
      
      // Check current permission state
      if (Notification.permission === 'granted') {
        debug.info('Notification permission already granted');
        return true;
      }
      
      // Request permission only if not already denied
      if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        debug.info('Notification permission request result:', permission);
        return permission === 'granted';
      }
      
      debug.info('Notification permission previously denied');
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
      debug.info('updateMaintenanceSchedule called', {
        treeId,
        treeName,
        type,
        enabled,
        lastPerformed,
        notificationTime,
        permission: Notification.permission,
        initialized: this.initialized,
        serviceWorker: !!this.serviceWorkerRegistration
      });

      await this.showNotification('Debug: Schedule Update Starting', {
        body: `Starting schedule update for ${type} - ${enabled ? 'ON' : 'OFF'}`,
        tag: 'debug-schedule-start'
      });

      await this.ensureInitialized();
      
      const key = `${treeId}-${type}`;

      // Clear existing timer
      if (this.notificationTimers[key]) {
        debug.info('Clearing existing timer', { key });
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
      const now = new Date();
      
      debug.info('Starting schedule calculation', {
        now: now.toISOString(),
        schedule,
        lastPerformed
      });

      // Set up initial date calculations
      let baseDate;
      if (lastPerformed) {
        baseDate = new Date(lastPerformed);
        debug.info('Using last performed date as base', { lastPerformed });
      } else {
        // If never performed, start from today at specified time
        baseDate = new Date();
        baseDate.setHours(notificationTime?.hours ?? 9);
        baseDate.setMinutes(notificationTime?.minutes ?? 0);
        baseDate.setSeconds(0);
        baseDate.setMilliseconds(0);
        
        // Move back one interval to ensure first notification isn't immediate
        baseDate.setTime(baseDate.getTime() - schedule.interval);
        debug.info('Created default base date', { 
          baseDate: baseDate.toISOString(),
          adjustedBy: -schedule.interval
        });
      }

      // Calculate next notification time
      let nextDate = new Date(baseDate.getTime() + schedule.interval);
      nextDate.setHours(notificationTime?.hours ?? 9);
      nextDate.setMinutes(notificationTime?.minutes ?? 0);
      nextDate.setSeconds(0);
      nextDate.setMilliseconds(0);

      // If next date is in the past, add intervals until we reach a future time
      let intervalsAdded = 0;
      while (nextDate <= now) {
        nextDate.setTime(nextDate.getTime() + schedule.interval);
        intervalsAdded++;
        debug.info('Added interval to reach future date', {
          attempt: intervalsAdded,
          newNextDate: nextDate.toISOString()
        });
      }

      const timeUntilNotification = nextDate.getTime() - now.getTime();

      await this.showNotification('Debug: Schedule Calculated', {
        body: `Next notification in ${Math.floor(timeUntilNotification / (1000 * 60 * 60))}h ${Math.floor((timeUntilNotification % (1000 * 60 * 60)) / (1000 * 60))}m`,
        tag: 'debug-schedule-calc'
      });

      debug.info('Timeout calculation', {
        timeUntilMs: timeUntilNotification,
        timeUntilHours: timeUntilNotification / (1000 * 60 * 60),
        baseDate: baseDate.toISOString(),
        nextDate: nextDate.toISOString(),
        intervalsAdded
      });

      // Safeguard against immediate or past notifications
      if (timeUntilNotification <= 1000) { // Less than 1 second
        debug.info('Adjusting schedule to prevent immediate notification', {
          originalTime: timeUntilNotification,
          adding: schedule.interval
        });
        nextDate = new Date(nextDate.getTime() + schedule.interval);
      }

      // Schedule notification
      this.notificationTimers[key] = setTimeout(async () => {
        try {
          const actualDelay = new Date().getTime() - now.getTime();
          debug.info('Notification firing', {
            expectedDelay: timeUntilNotification,
            actualDelay,
            difference: actualDelay - timeUntilNotification,
            scheduled: nextDate.toISOString(),
            now: new Date().toISOString()
          });

          if (actualDelay < timeUntilNotification - 1000) {  // If fired more than 1 second early
            debug.warn('Notification fired earlier than scheduled!', {
              expectedDelay: timeUntilNotification,
              actualDelay,
              difference: timeUntilNotification - actualDelay
            });
            return; // Skip showing the notification
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
          await this.showNotification('Debug: Notification Error', {
            body: `Error showing notification: ${error instanceof Error ? error.message : 'Unknown error'}`,
            tag: 'debug-notification-error'
          });
        }
      }, timeUntilNotification);

      debug.info(`Scheduled ${type} notification for ${treeName} at ${nextDate.toISOString()}`);
      
      await this.showNotification('Debug: Schedule Complete', {
        body: `Scheduled ${type} notification for ${nextDate.toLocaleString()}`,
        tag: 'debug-schedule-complete'
      });
    } catch (error) {
      debug.error('Error updating maintenance schedule:', error);
      await this.showNotification('Debug: Schedule Error', {
        body: `Error updating schedule: ${error instanceof Error ? error.message : 'Unknown error'}`,
        tag: 'debug-schedule-error'
      });
      throw error;
    }
  }

  async testNotification(): Promise<void> {
    try {
      debug.info('Testing notification service...');
      
      await this.ensureInitialized();
      
      if (Notification.permission !== 'granted') {
        const permission = await this.requestPermission();
        if (!permission) {
          throw new Error('Notification permission not granted');
        }
      }

      debug.info('Showing test notification');

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
      
      debug.info('Test notification sent successfully');
    } catch (error) {
      debug.error('Test notification failed:', error);
      throw error;
    }
  }

  async testScheduledNotification(): Promise<void> {
    try {
      debug.info('Testing scheduled notification...');
      
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
      
      debug.info('Test scheduled notification set successfully');
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