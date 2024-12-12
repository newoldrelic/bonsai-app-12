import { debug } from '../utils/debug';
import type { MaintenanceType, NotificationSettings, MaintenanceSchedule } from '../types';
import { MAINTENANCE_SCHEDULES } from '../config/maintenance';
import { format, addMilliseconds, setHours, setMinutes } from 'date-fns';
import { db } from '../config/firebase';
import { doc, setDoc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';

class NotificationService {
  private static instance: NotificationService;
  private registration: ServiceWorkerRegistration | null = null;
  private initialized = false;
  private notificationTime = { hours: 9, minutes: 0 }; // Default to 9:00 AM
  private userEmail: string | null = null;

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

  // Rest of the existing methods remain the same...
  
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
        schedules: admin.firestore.FieldValue.arrayUnion(schedule)
      }, { merge: true });

      if (enabled) {
        await this.scheduleNotification(treeId, treeName, type, lastPerformed);
      }
    } catch (error) {
      debug.error('Failed to update maintenance schedule:', error);
      throw error;
    }
  }
}

export const notificationService = NotificationService.getInstance();