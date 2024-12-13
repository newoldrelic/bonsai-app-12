import React, { useState, useEffect } from 'react';
import { Bell, Calendar, AlertCircle } from 'lucide-react';
import { Toggle } from './Toggle';
import { NotificationTimeSelector } from './NotificationTimeSelector';
import type { NotificationPreferences } from '../types';
import { notificationService } from '../services/notificationService';
import { debug } from '../utils/debug';

interface MaintenanceSectionProps {
  notifications: NotificationPreferences;
  notificationTime?: { hours: number; minutes: number };
  onNotificationChange: (type: keyof NotificationPreferences, value: boolean) => void;
  onNotificationTimeChange?: (hours: number, minutes: number) => void;
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

export function MaintenanceSection({ 
  notifications, 
  notificationTime = { hours: 9, minutes: 0 },
  onNotificationChange,
  onNotificationTimeChange,
  onAddToCalendarChange, 
  addToCalendar 
}: MaintenanceSectionProps) {
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const hasEnabledNotifications = Object.values(notifications).some(value => value);

  // Initialize notification service
  useEffect(() => {
    const initNotifications = async () => {
      try {
        await notificationService.init();
        setInitialized(true);
        setError(null);
      } catch (error) {
        debug.error('Failed to initialize notifications:', error);
        setError('Failed to initialize notifications. Please try again.');
      }
    };

    initNotifications();
  }, []);

  const handleNotificationToggle = async (type: keyof NotificationPreferences, enabled: boolean) => {
    if (!initialized) {
      setError('Please wait while notifications are being initialized...');
      return;
    }

    try {
      if (enabled) {
        // Request permission if enabling notifications
        const permissionGranted = await notificationService.requestPermission();
        if (!permissionGranted) {
          setError('Please allow notifications in your browser to enable reminders');
          return;
        }
      }

      // Update the notification state through parent component
      onNotificationChange(type, enabled);
      setError(null); // Clear any previous errors on success

      // Send a welcome notification if enabling first notification
      if (enabled && !hasEnabledNotifications) {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Bonsai Care Notifications Enabled', {
            body: 'You will now receive maintenance reminders for your bonsai trees.',
            icon: '/bonsai-icon.png'
          });
        }
      }
    } catch (error) {
      debug.error('Error handling notification toggle:', error);
      setError('Failed to update notification settings. Please try again.');
    }
  };

  const handleTimeChange = (hours: number, minutes: number) => {
    try {
      if (onNotificationTimeChange) {
        onNotificationTimeChange(hours, minutes);
        setError(null); // Clear any previous errors
      }
    } catch (error) {
      debug.error('Error updating notification time:', error);
      setError('Failed to update notification time. Please try again.');
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
        {error && (
          <div className="flex items-start space-x-2 text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {NOTIFICATION_TYPES.map(({ id, label, description, icon }) => (
          <Toggle
            key={id}
            checked={notifications[id as keyof typeof notifications]}
            onChange={(checked) => handleNotificationToggle(id as keyof NotificationPreferences, checked)}
            label={label}
            description={description}
            icon={<span className="text-base">{icon}</span>}
            disabled={!initialized}
          />
        ))}

        {hasEnabledNotifications && (
          <>
            <div className="border-t border-stone-200 dark:border-stone-700 pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-stone-700 dark:text-stone-300">
                  Notification Time
                </label>
                <NotificationTimeSelector
                  value={notificationTime}
                  onChange={handleTimeChange}
                />
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