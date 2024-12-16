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
      // Log entry point with full context
      debug.info('updateMaintenanceSchedule called', {
        treeId,
        type,
        enabled,
        lastPerformed,
        notificationTime,
        currentState: {
          hasExistingTimer: !!this.notificationTimers[`${treeId}-${type}`],
          initialized: this.initialized,
          permission: Notification.permission
        }
      });

      // Capture stack trace for debugging
      const triggerStack = new Error().stack;
      const triggerTime = new Date().toISOString();

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
      const baseDateSource = lastPerformed ? 'lastPerformed' : 'default';
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

      // Log detailed timing calculations
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

      debug.info('Scheduling notification', {
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
              body: schedule.message,  // Just show the maintenance message
              icon: '/bonsai-icon.svg',
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
              icon: '/bonsai-icon.svg',
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