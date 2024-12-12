import { debug } from '../utils/debug';
import type { MaintenanceType } from '../types';
import { MAINTENANCE_SCHEDULES } from '../config/maintenance';
import { format, addMilliseconds, setHours, setMinutes } from 'date-fns';

class NotificationService {
  private static instance: NotificationService;
  private registration: ServiceWorkerRegistration | null = null;
  private initialized = false;
  private notificationTime = { hours: 9, minutes: 0 }; // Default to 9:00 AM

  private constructor() {}

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      if (!('serviceWorker' in navigator)) {
        throw new Error('Service Worker not supported');
      }

      // Register service worker
      this.registration = await navigator.serviceWorker.register('/notification-worker.js');
      await navigator.serviceWorker.ready;

      // Set up message handling
      navigator.serviceWorker.addEventListener('message', this.handleServiceWorkerMessage);
      
      this.initialized = true;
      debug.info('Notification service initialized');
    } catch (error) {
      debug.error('Failed to initialize notification service:', error);
      throw error;
    }
  }

  setNotificationTime(hours: number, minutes: number): void {
    this.notificationTime = { hours, minutes };
    debug.info('Notification time set to:', { hours, minutes });
  }

  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      debug.warn('Notifications not supported');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      const granted = permission === 'granted';

      if (granted) {
        await this.sendTestNotification();
      }

      return granted;
    } catch (error) {
      debug.error('Error requesting notification permission:', error);
      return false;
    }
  }

  async scheduleNotification(
    treeId: string,
    treeName: string,
    type: MaintenanceType,
    lastPerformed?: string
  ): Promise<void> {
    if (!this.initialized || !this.registration) {
      debug.warn('Notification service not initialized');
      return;
    }

    if (!this.hasPermission()) {
      debug.warn('Notification permission not granted');
      return;
    }

    try {
      const schedule = MAINTENANCE_SCHEDULES[type];
      const lastDate = lastPerformed ? new Date(lastPerformed) : new Date();
      const nextDate = this.calculateNextNotificationTime(lastDate, schedule.interval);

      // Schedule the notification using the service worker
      const timestamp = nextDate.getTime();
      
      await this.registration.showNotification(`Bonsai Maintenance: ${treeName}`, {
        body: `${schedule.message} (Last done: ${format(lastDate, 'PP')})`,
        icon: '/bonsai-icon.png',
        tag: `${treeId}-${type}`,
        requireInteraction: true,
        showTrigger: new TimestampTrigger(timestamp),
        actions: [
          { action: 'done', title: 'Mark as Done' },
          { action: 'snooze', title: 'Snooze 1hr' }
        ],
        data: {
          treeId,
          type,
          lastPerformed: lastDate.toISOString(),
          nextScheduled: nextDate.toISOString()
        }
      });

      debug.info(`Scheduled ${type} notification for ${treeName} at ${format(nextDate, 'PPpp')}`);
    } catch (error) {
      debug.error('Failed to schedule notification:', error);
    }
  }

  private hasPermission(): boolean {
    return Notification.permission === 'granted';
  }

  private async sendTestNotification(): Promise<void> {
    if (!this.registration) return;

    await this.registration.showNotification('Bonsai Care Notifications Enabled', {
      body: 'You will now receive maintenance reminders for your bonsai trees.',
      icon: '/bonsai-icon.png'
    });
  }

  private calculateNextNotificationTime(lastDate: Date, interval: number): Date {
    // Calculate the next occurrence based on the interval
    let nextDate = addMilliseconds(lastDate, interval);
    
    // Set to configured notification time
    nextDate = setHours(nextDate, this.notificationTime.hours);
    nextDate = setMinutes(nextDate, this.notificationTime.minutes);
    
    // If the calculated time is in the past, add the interval
    const now = new Date();
    if (nextDate < now) {
      nextDate = addMilliseconds(nextDate, interval);
    }
    
    return nextDate;
  }

  private handleServiceWorkerMessage = async (event: MessageEvent) => {
    if (event.data?.type === 'MAINTENANCE_DONE') {
      const { data } = event.data;
      if (data?.treeId && data?.type) {
        // Schedule next notification
        const nextDate = this.calculateNextNotificationTime(new Date(), MAINTENANCE_SCHEDULES[data.type].interval);
        await this.scheduleNotification(data.treeId, data.treeName, data.type, new Date().toISOString());
        
        // Emit event for maintenance completion
        window.dispatchEvent(new CustomEvent('maintenanceCompleted', {
          detail: { treeId: data.treeId, type: data.type }
        }));
      }
    }
  };
}

export const notificationService = NotificationService.getInstance();