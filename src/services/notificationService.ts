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
      debug.info('Requesting notification permission, current state:', Notification.permission);
      
      // Check current permission state
      if (Notification.permission === 'granted') {
        return true;
      }
      
      // Request permission only if not already denied
      if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        debug.info('Permission request result:', permission);
        
        if (permission === 'granted') {
          // Remove the welcome notification - this might be causing duplicates
          // new Notification('Bonsai Care Notifications Enabled', {
          //   body: 'You will now receive maintenance reminders for your bonsai trees.',
          //   icon: '/bonsai-icon.png'
          // });
          return true;
        }
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
      debug.info('Starting updateMaintenanceSchedule:', {
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
        debug.info('Clearing existing timer for:', key);
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
        debug.info('No lastPerformed date, adjusting base date');
        baseDate = new Date(baseDate.getTime() - schedule.interval);
      }
      
      const hours = notificationTime?.hours ?? 9;
      const minutes = notificationTime?.minutes ?? 0;
      
      // Calculate next notification time
      let nextDate = addDays(baseDate, schedule.interval / (24 * 60 * 60 * 1000));
      nextDate = setHours(nextDate, hours);
      nextDate = setMinutes(nextDate, minutes);
  
      debug.info('Initial next date calculation:', nextDate.toISOString());
  
      // If calculated time is in past, add intervals until we reach future time
      while (nextDate < new Date()) {
        debug.info('Next date is in past, adding interval');
        nextDate = addDays(nextDate, schedule.interval / (24 * 60 * 60 * 1000));
      }
  
      const timeUntilNotification = nextDate.getTime() - Date.now();
      debug.info('Time until notification:', {
        hours: timeUntilNotification / (1000 * 60 * 60),
        minutes: (timeUntilNotification / (1000 * 60)) % 60
      });
  
      if (timeUntilNotification <= 0) {
        debug.warn('Preventing immediate notification - time until notification is <= 0');
        return;
      }
  
      // Schedule notification
      this.notificationTimers[key] = setTimeout(async () => {
        // ... rest of the notification code ...
      }, Math.max(0, timeUntilNotification));
  
      debug.info(`Scheduled ${type} notification for ${treeName} at ${nextDate.toISOString()}`);
    } catch (error) {
      debug.error('Error updating maintenance schedule:', error);
      throw error;
    }
  }

export const notificationService = new NotificationService();