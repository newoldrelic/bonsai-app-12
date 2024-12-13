import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { debug } from '../utils/debug';
import { MAINTENANCE_SCHEDULES } from '../config/maintenance';
import type { MaintenanceType, NotificationSettings, MaintenanceSchedule } from '../types';
import { addDays, setHours, setMinutes } from 'date-fns';

class NotificationService {
  private userEmail: string | null = null;
  private notificationTime = { hours: 9, minutes: 0 };
  private notificationTimers: Record<string, NodeJS.Timeout> = {};
  private serviceWorkerRegistration: ServiceWorkerRegistration | null = null;

  constructor() {
    auth.onAuthStateChanged(user => {
      this.userEmail = user?.email || null;
      if (user?.email) {
        this.init().catch(error => {
          debug.error('Failed to initialize notification service:', error);
        });
      } else {
        this.clearAllTimers();
      }
    });
  }

  async init(): Promise<void> {
    if (!('Notification' in window)) {
      throw new Error('This browser does not support notifications');
    }

    try {
      // Register service worker
      if ('serviceWorker' in navigator) {
        this.serviceWorkerRegistration = await navigator.serviceWorker.register('/notification-worker.js');
        debug.info('Service Worker registered');
      }

      // Load notification settings
      if (this.userEmail) {
        const settings = await this.getNotificationSettings();
        if (settings) {
          this.notificationTime = {
            hours: settings.hours,
            minutes: settings.minutes
          };
        }
      }
    } catch (error) {
      debug.error('Failed to initialize notification service:', error);
      throw error;
    }
  }

  private async getNotificationSettings(): Promise<NotificationSettings | null> {
    if (!this.userEmail) return null;

    try {
      const settingsRef = doc(db, 'notificationSettings', this.userEmail);
      const settingsDoc = await getDoc(settingsRef);
      
      if (settingsDoc.exists()) {
        return settingsDoc.data() as NotificationSettings;
      }
    } catch (error) {
      debug.error('Failed to get notification settings:', error);
    }

    return null;
  }

  async getNotificationTime(): Promise<{ hours: number; minutes: number }> {
    const settings = await this.getNotificationSettings();
    return settings ? { hours: settings.hours, minutes: settings.minutes } : this.notificationTime;
  }

  async setNotificationTime(hours: number, minutes: number): Promise<void> {
    if (!this.userEmail) return;

    try {
      const settingsRef = doc(db, 'notificationSettings', this.userEmail);
      await setDoc(settingsRef, {
        hours,
        minutes,
        userEmail: this.userEmail,
        updatedAt: serverTimestamp()
      }, { merge: true });

      this.notificationTime = { hours, minutes };
      await this.rescheduleAllNotifications();
    } catch (error) {
      debug.error('Failed to save notification time:', error);
      throw error;
    }
  }

  async updateMaintenanceSchedule(
    treeId: string,
    treeName: string,
    type: MaintenanceType,
    enabled: boolean,
    lastPerformed?: string
  ): Promise<void> {
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
      debug.warn('Notifications not permitted');
      return;
    }

    const schedule = MAINTENANCE_SCHEDULES[type];
    const lastDate = lastPerformed ? new Date(lastPerformed) : new Date();
    
    // Calculate next notification time
    let nextDate = addDays(lastDate, schedule.interval / (24 * 60 * 60 * 1000));
    nextDate = setHours(nextDate, this.notificationTime.hours);
    nextDate = setMinutes(nextDate, this.notificationTime.minutes);

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
        this.updateMaintenanceSchedule(treeId, treeName, type, true, nextDate.toISOString());
      } catch (error) {
        debug.error('Failed to show notification:', error);
      }
    }, Math.max(0, timeUntilNotification));

    debug.info(`Scheduled ${type} notification for ${treeName} at ${nextDate.toISOString()}`);
  }

  async rescheduleAllNotifications(): Promise<void> {
    // This would be called when notification time changes
    // Implementation would get all trees and their schedules from Firestore
    // and reschedule notifications for each enabled maintenance type
    debug.info('Rescheduling all notifications');
  }

  private clearAllTimers(): void {
    Object.values(this.notificationTimers).forEach(timer => clearTimeout(timer));
    this.notificationTimers = {};
  }
}

export const notificationService = new NotificationService();