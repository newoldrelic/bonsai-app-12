import { debug } from '../utils/debug';
import type { MaintenanceType, NotificationSettings, MaintenanceSchedule } from '../types';
import { MAINTENANCE_SCHEDULES } from '../config/maintenance';
import { format, addMilliseconds, setHours, setMinutes } from 'date-fns';
import { db } from '../config/firebase';
import { doc, setDoc, getDoc, collection, query, where, getDocs, arrayUnion } from 'firebase/firestore';

class NotificationService {
  private static instance: NotificationService;
  private registration: ServiceWorkerRegistration | null = null;
  private initialized = false;
  private notificationTime = { hours: 9, minutes: 0 }; // Default to 9:00 AM
  private userEmail: string | null = null;
  private notificationTimers: Record<string, NodeJS.Timeout> = {};

  private constructor() {}

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  async init(userEmail?: string): Promise<void> {
    if (this.initialized && this.userEmail === userEmail) return;

    try {
      if (!('serviceWorker' in navigator)) {
        throw new Error('Service Worker not supported');
      }

      // Register service worker
      this.registration = await navigator.serviceWorker.register('/notification-worker.js');
      await navigator.serviceWorker.ready;

      // Set up message handling
      navigator.serviceWorker.addEventListener('message', this.handleServiceWorkerMessage);
      
      // Set user email and load settings
      if (userEmail) {
        this.userEmail = userEmail;
        await this.loadNotificationSettings();
      }
      
      this.initialized = true;
      debug.info('Notification service initialized');
    } catch (error) {
      debug.error('Failed to initialize notification service:', error);
      throw error;
    }
  }

  async setNotificationTime(hours: number, minutes: number): Promise<void> {
    this.notificationTime = { hours, minutes };
    
    if (this.userEmail) {
      try {
        const settingsRef = doc(db, 'notificationSettings', this.userEmail);
        await setDoc(settingsRef, {
          hours,
          minutes,
          userEmail: this.userEmail
        }, { merge: true });
        
        // Reschedule all notifications with new time
        await this.rescheduleAllNotifications();
        
        debug.info('Notification time saved:', { hours, minutes });
      } catch (error) {
        debug.error('Failed to save notification time:', error);
        throw error;
      }
    }
  }

  private async loadNotificationSettings(): Promise<void> {
    if (!this.userEmail) return;

    try {
      const settingsRef = doc(db, 'notificationSettings', this.userEmail);
      const settingsDoc = await getDoc(settingsRef);
      
      if (settingsDoc.exists()) {
        const settings = settingsDoc.data() as NotificationSettings;
        this.notificationTime = {
          hours: settings.hours,
          minutes: settings.minutes
        };
        
        // Reschedule all active notifications
        if (settings.schedules) {
          for (const schedule of settings.schedules) {
            if (schedule.enabled) {
              await this.scheduleNotification(
                schedule.treeId,
                schedule.treeName,
                schedule.type,
                schedule.lastPerformed
              );
            }
          }
        }
      }
    } catch (error) {
      debug.error('Failed to load notification settings:', error);
    }
  }

  private async rescheduleAllNotifications(): Promise<void> {
    if (!this.userEmail) return;

    try {
      const schedulesRef = collection(db, 'notificationSettings');
      const q = query(schedulesRef, where('userEmail', '==', this.userEmail));
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const settings = snapshot.docs[0].data() as NotificationSettings;
        
        for (const schedule of settings.schedules) {
          if (schedule.enabled) {
            await this.scheduleNotification(
              schedule.treeId,
              schedule.treeName,
              schedule.type,
              schedule.lastPerformed
            );
          }
        }
      }
    } catch (error) {
      debug.error('Failed to reschedule notifications:', error);
    }
  }

  private calculateNextNotificationTime(lastDate: Date, interval: number): Date {
    let nextDate = addMilliseconds(lastDate, interval);
    nextDate = setHours(nextDate, this.notificationTime.hours);
    nextDate = setMinutes(nextDate, this.notificationTime.minutes);

    // If calculated time is in the past, add interval
    if (nextDate < new Date()) {
      nextDate = addMilliseconds(nextDate, interval);
    }

    return nextDate;
  }

  private clearExistingNotification(key: string): void {
    if (this.notificationTimers[key]) {
      clearTimeout(this.notificationTimers[key]);
      delete this.notificationTimers[key];
    }
  }

  private handleServiceWorkerMessage = async (event: MessageEvent) => {
    if (event.data?.type === 'MAINTENANCE_DONE') {
      const { data } = event.data;
      if (data?.treeId && data?.type) {
        try {
          await this.updateMaintenanceSchedule(
            data.treeId,
            data.treeName,
            data.type as MaintenanceType,
            true,
            new Date().toISOString()
          );
          debug.info('Maintenance task completed:', data);
        } catch (error) {
          debug.error('Failed to update maintenance schedule:', error);
        }
      }
    }
  };

  async scheduleNotification(
    treeId: string,
    treeName: string,
    type: MaintenanceType,
    lastPerformed?: string
  ): Promise<void> {
    if (!this.registration || !('Notification' in window) || Notification.permission !== 'granted') {
      debug.warn('Notifications not available or not permitted');
      return;
    }

    const schedule = MAINTENANCE_SCHEDULES[type];
    const lastDate = lastPerformed ? new Date(lastPerformed) : new Date();
    const nextDate = this.calculateNextNotificationTime(lastDate, schedule.interval);
    const timeUntilNotification = nextDate.getTime() - Date.now();
    const key = `${treeId}-${type}`;

    // Clear any existing notification
    this.clearExistingNotification(key);

    // Schedule new notification
    this.notificationTimers[key] = setTimeout(async () => {
      try {
        await this.registration?.showNotification(`Bonsai Maintenance: ${treeName}`, {
          body: `${schedule.message} (Last done: ${format(lastDate, 'PP')})`,
          icon: '/bonsai-icon.png',
          tag: key,
          requireInteraction: true,
          data: { treeId, treeName, type }
        });

        // Schedule next notification
        await this.scheduleNotification(treeId, treeName, type, nextDate.toISOString());
      } catch (error) {
        debug.error('Failed to show notification:', error);
      }
    }, Math.max(0, timeUntilNotification));

    debug.info(`Scheduled ${type} notification for ${treeName} at ${format(nextDate, 'PPpp')}`);
  }

  async updateMaintenanceSchedule(
    treeId: string,
    treeName: string,
    type: MaintenanceType,
    enabled: boolean,
    lastPerformed?: string
  ): Promise<void> {
    if (!this.userEmail) return;

    try {
      const settingsRef = doc(db, 'notificationSettings', this.userEmail);
      const nextScheduled = this.calculateNextNotificationTime(
        lastPerformed ? new Date(lastPerformed) : new Date(),
        MAINTENANCE_SCHEDULES[type].interval
      ).toISOString();

      const schedule: MaintenanceSchedule = {
        treeId,
        treeName,
        type,
        enabled,
        lastPerformed,
        nextScheduled
      };

      await setDoc(settingsRef, {
        userEmail: this.userEmail,
        schedules: arrayUnion(schedule)
      }, { merge: true });

      if (enabled) {
        await this.scheduleNotification(treeId, treeName, type, lastPerformed);
      } else {
        this.clearExistingNotification(`${treeId}-${type}`);
      }
    } catch (error) {
      debug.error('Failed to update maintenance schedule:', error);
      throw error;
    }
  }
}

export const notificationService = NotificationService.getInstance();