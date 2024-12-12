import React, { useEffect } from 'react';
import { Bell, Calendar } from 'lucide-react';
import { Toggle } from './Toggle';
import { NotificationTimeSelector } from './NotificationTimeSelector';
import type { NotificationPreferences } from '../types';
import { notificationService } from '../services/notificationService';
import { debug } from '../utils/debug';

interface MaintenanceSectionProps {
  notifications: NotificationPreferences;
  onNotificationChange: (type: keyof NotificationPreferences, value: boolean) => void;
  onAddToCalendarChange: (value: boolean) => void;
  addToCalendar: boolean;
}

const NOTIFICATION_TYPES = [
  { id: 'watering', label: 'Watering Reminders', description: 'Get notified when it\'s time to water your bonsai', icon: '💧' },
  { id: 'fertilizing', label: 'Fertilization Schedule', description: 'Reminders for seasonal fertilization', icon: '🌱' },
  { id: 'pruning', label: 'Pruning Alerts', description: 'Notifications for regular pruning maintenance', icon: '✂️' },
  { id: 'wiring', label: 'Wire Check Reminders', description: 'Reminders to check and adjust wiring', icon: '🔄' },
  { id: 'repotting', label: 'Repotting Schedule', description: 'Alerts for seasonal repotting', icon: '🪴' }
] as const;

export function MaintenanceSection({ notifications, onNotificationChange, onAddToCalendarChange, addToCalendar }: MaintenanceSectionProps) {
  const hasEnabledNotifications = Object.values(notifications).some(value => value);

  useEffect(() => {
    // Initialize notification service when component mounts
    notificationService.init().catch(error => {
      debug.error('Failed to initialize notifications:', error);
    });
  }, []);

  const handleNotificationToggle = async (type: keyof NotificationPreferences, enabled: boolean) => {
    try {
      if (enabled) {
        // Request permission if enabling notifications
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          debug.warn('Notification permission denied');
          return;
        }
      }

      // Update the notification state
      onNotificationChange(type, enabled);

      // Send a welcome notification if enabling
      if (enabled) {
        new Notification('Bonsai Care Notifications Enabled', {
          body: 'You will now receive maintenance reminders for your bonsai trees.',
          icon: '/bonsai-icon.png'
        });
      }
    } catch (error) {
      debug.error('Error handling notification toggle:', error);
    }
  };

  return (
    <div>
      <div className="flex items-center space-x-2 mb-4">
        <Bell className="w-5 h-5 text-bonsai-green" />
        <span className="text-sm font-medium text-stone-700 dark:text-stone-300">
          Maintenance Reminders
        </span>
      </div>

      <div className="space-y-4 bg-stone-50 dark:bg-stone-800/50 rounded-lg p-4">
        {NOTIFICATION_TYPES.map(({ id, label, description, icon }) => (
          <Toggle
            key={id}
            checked={notifications[id as keyof typeof notifications]}
            onChange={(checked) => handleNotificationToggle(id as keyof NotificationPreferences, checked)}
            label={label}
            description={description}
            icon={<span className="text-base">{icon}</span>}
          />
        ))}

        {hasEnabledNotifications && (
          <>
            <div className="border-t border-stone-200 dark:border-stone-700 pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-stone-700 dark:text-stone-300">
                  Notification Time
                </label>
                <NotificationTimeSelector />
              </div>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                All maintenance reminders will be sent at this time
              </p>
            </div>

            <div className="border-t border-stone-200 dark:border-stone-700 pt-4">
              <Toggle
                checked={addToCalendar}
                onChange={onAddToCalendarChange}
                label="Add to Calendar"
                description="Download an .ics file to add maintenance schedules to your calendar"
                icon={<Calendar className="w-4 h-4 text-bonsai-green" />}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}