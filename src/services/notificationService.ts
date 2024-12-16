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
      // Capture stack trace for debugging
      const triggerStack = new Error().stack;
      const triggerTime = new Date().toISOString();

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
      const now = new Date();
      
      // Set up initial date calculations
      let baseDate;
      const baseDateSource = lastPerformed ? 'lastPerformed' : 'default';
      if (lastPerformed) {
        baseDate = new Date(lastPerformed);
      } else {
        // If never performed, start from today at specified time
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
      let intervalsAdded = 0;
      while (nextDate <= now) {
        nextDate.setTime(nextDate.getTime() + schedule.interval);
        intervalsAdded++;
      }

      const timeUntilNotification = nextDate.getTime() - now.getTime();

      // Add this debug info at the point of calculation
      debug.info(`Timeout calculation:`, {
        timeUntilMs: timeUntilNotification,
        timeUntilHours: timeUntilNotification / (1000 * 60 * 60)
      });

      // Safeguard against immediate or past notifications
      if (timeUntilNotification <= 1000) { // Less than 1 second
        debug.info('Adjusting schedule to prevent immediate notification');
        nextDate = new Date(nextDate.getTime() + schedule.interval);
      }

      debug.info('Scheduling notification:', {
        type,
        treeName,
        lastPerformed: lastPerformed || 'never',
        baseDate: baseDate.toISOString(),
        nextDate: nextDate.toISOString(),
        timeUntil: {
          hours: Math.floor(timeUntilNotification / (1000 * 60 * 60)),
          minutes: Math.floor((timeUntilNotification % (1000 * 60 * 60)) / (1000 * 60))
        }
      });

      // Schedule notification
      this.notificationTimers[key] = setTimeout(async () => {
        try {
          if (this.serviceWorkerRegistration) {
            const debugMessage = `${schedule.message}\n\n` + 
              `Debug Info:\n` +
              `Trigger Details:\n` +
              `Trigger Stack:\n${triggerStack}\n\n` +
              `- Base Date Source: ${baseDateSource}\n` +
              `- Intervals Added: ${intervalsAdded}\n` +
              `Timing Info:\n` +
              `- Last Performed: ${lastPerformed ? new Date(lastPerformed).toLocaleString() : 'never'}\n` +
              `- Base Date: ${baseDate.toLocaleString()}\n` +
              `- Scheduled For: ${nextDate.toLocaleString()}\n` +
              `- Actual Time: ${new Date().toLocaleString()}\n` +
              `- Interval: ${schedule.interval / (24 * 60 * 60 * 1000)} days\n` +
              `- Time Until Next: ${Math.floor(timeUntilNotification / (1000 * 60 * 60))}h ${Math.floor((timeUntilNotification % (1000 * 60 * 60)) / (1000 * 60))}m\n` +
              `Settings:\n` +
              `- Notification Time: ${notificationTime?.hours ?? 9}:${(notificationTime?.minutes ?? 0).toString().padStart(2, '0')}\n` +
              `- Tree ID: ${treeId}\n` +
              `- Maintenance Type: ${type}\n\n` +
              `- Time: ${triggerTime}`;
      
            await this.serviceWorkerRegistration.showNotification(`Bonsai Maintenance: ${treeName}`, {
              body: debugMessage,
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
            // Also update the fallback notification
            new Notification(`Bonsai Maintenance: ${treeName}`, {
              body: debugMessage,
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