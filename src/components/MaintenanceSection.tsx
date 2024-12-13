import React, { useState } from 'react';
import { Bell, Calendar, AlertCircle } from 'lucide-react';
import { Toggle } from './Toggle';
import { NotificationTimeSelector } from './NotificationTimeSelector';
import type { NotificationPreferences } from '../types';
import { notificationService } from '../services/notificationService';
import { debug } from '../utils/debug';

const NotificationConsentModal = ({ 
  onConfirm, 
  onCancel 
}: { 
  onConfirm: () => void; 
  onCancel: () => void; 
}) => {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
      <div className="bg-white dark:bg-stone-800 rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex items-center space-x-3 text-bonsai-green mb-4">
          <Bell className="w-6 h-6" />
          <h3 className="text-lg font-semibold">Enable Maintenance Reminders</h3>
        </div>
        <p className="text-stone-600 dark:text-stone-300 mb-4">
          Get timely reminders for watering, pruning, and other essential bonsai care tasks. Never miss an important maintenance task again.
        </p>
        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 rounded-lg transition-colors"
          >
            Not Now
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 bg-bonsai-green text-white rounded-lg hover:bg-bonsai-moss transition-colors"
          >
            Enable Reminders
          </button>
        </div>
      </div>
    </div>
  );
};

const isIOS = () => {
  return [
    'iPad Simulator',
    'iPhone Simulator',
    'iPod Simulator',
    'iPad',
    'iPhone',
    'iPod'
  ].includes(navigator.platform)
  || (navigator.userAgent.includes("Mac") && "ontouchend" in document);
};

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
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [pendingToggleType, setPendingToggleType] = useState<keyof NotificationPreferences | null>(null);
  
  const hasEnabledNotifications = Object.values(notifications).some(value => value);

  // Initialize notification service
  React.useEffect(() => {
    const initNotifications = async () => {
      try {
        if (!isIOS()) {
          await notificationService.init();
        }
        setInitialized(true);
        setError(null);
      } catch (error) {
        if (error instanceof Error && 
            !error.message.includes('permission') && 
            !error.message.includes('support')) {
          debug.error('Failed to initialize notifications:', error);
          setError('Failed to initialize notifications. Please try again.');
        }
        setInitialized(true);
      }
    };

    initNotifications();
  }, []);

  const enableNotification = async (type: keyof NotificationPreferences) => {
    try {
      await notificationService.init();
      const permission = await Notification.requestPermission();
      
      if (permission === 'granted') {
        onNotificationChange(type, true);
        setError(null);

        if (!hasEnabledNotifications) {
          new Notification('Bonsai Care Notifications Enabled', {
            body: 'You will now receive maintenance reminders for your bonsai trees.',
            icon: '/bonsai-icon.png'
          });
        }
      } else {
        setError('Please allow notifications when prompted');
      }
    } catch (error) {
      setError(`Failed to enable notifications: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleConsentConfirm = async () => {
    if (pendingToggleType) {
      await enableNotification(pendingToggleType);
    }
    setShowConsentModal(false);
    setPendingToggleType(null);
  };

  const handleConsentCancel = () => {
    setShowConsentModal(false);
    setPendingToggleType(null);
  };

  const handleNotificationToggle = async (type: keyof NotificationPreferences, enabled: boolean) => {
    try {
      if (isIOS()) {
        onNotificationChange(type, enabled);
        return;
      }

      if (enabled) {
        if (!('Notification' in window)) {
          setError('Notifications are not supported');
          return;
        }

        // If permission is denied, show settings instructions
        if (Notification.permission === 'denied') {
          setError(
            'To enable notifications:\n' +
            '1. Long press the Bonsai Care app icon on your home screen\n' +
            '2. Tap "App info" or ⓘ\n' +
            '3. Tap "Notifications"\n' +
            '4. Toggle notifications on'
          );
          return;
        }

        // If permission hasn't been granted yet, show our custom modal
        if (Notification.permission === 'default') {
          setPendingToggleType(type);
          setShowConsentModal(true);
          return;
        }

        // Permission is already granted, proceed with enabling
        await enableNotification(type);
      } else {
        // Disabling notifications - just update state
        onNotificationChange(type, enabled);
        setError(null);
      }
    } catch (error) {
      debug.error('Error in handleNotificationToggle:', error);
      setError(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleTimeChange = (hours: number, minutes: number) => {
    try {
      if (onNotificationTimeChange) {
        onNotificationTimeChange(hours, minutes);
        setError(null);
      }
    } catch (error) {
      debug.error('Error updating notification time:', error);
      setError('Failed to update notification time. Please try again.');
    }
  };

  return (
    <div>
      {isIOS() && (
        <div className="mb-4 text-sm bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 p-3 rounded-lg">
          Browser notifications are not available on iOS devices. Your selected maintenance reminders will be added to your calendar instead.
        </div>
      )}
      <div className="flex items-center space-x-2 mb-4">
        <Bell className="w-5 h-5 text-bonsai-green" />
        <span className="text-sm font-medium text-stone-700 dark:text-stone-300">
          Maintenance Reminders
        </span>
      </div>

      <div className="space-y-4 bg-stone-50 dark:bg-stone-800/50 rounded-lg p-4">
        {error && (
          <div className="flex items-start space-x-2 text-stone-600 dark:text-stone-300 text-sm bg-stone-100 dark:bg-stone-700/50 p-4 rounded-lg">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-bonsai-green" />
            <div className="space-y-2">
              <p className="font-medium">Enable Notifications</p>
              <ul className="list-decimal ml-4 space-y-1">
                <li>Long press the Bonsai Care app icon on your home screen</li>
                <li>Tap "App info" or ⓘ</li>
                <li>Tap "Notifications"</li>
                <li>Toggle notifications on</li>
              </ul>
            </div>
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
          />
        ))}

        {hasEnabledNotifications && (
          <div className="border-t border-stone-200 dark:border-stone-700 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-stone-700 dark:text-stone-300">
                {isIOS() ? 'Calendar Event Time' : 'Notification Time'}
              </label>
              <NotificationTimeSelector
                value={notificationTime}
                onChange={handleTimeChange}
              />
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              {isIOS() 
                ? 'All calendar events will be scheduled at this time'
                : 'All maintenance reminders will be sent at this time'}
            </p>
          </div>
        )}

        {/* Show calendar option (auto-enabled for iOS) */}
        {(hasEnabledNotifications || isIOS()) && (
          <div className="border-t border-stone-200 dark:border-stone-700 pt-4">
            <Toggle
              checked={isIOS() ? true : addToCalendar}
              onChange={onAddToCalendarChange}
              label="Add to Calendar"
              description="Download an .ics file to add maintenance schedules to your calendar"
              icon={<Calendar className="w-4 h-4 text-bonsai-green" />}
              disabled={isIOS()}
            />
          </div>
        )}
      </div>

      {showConsentModal && (
        <NotificationConsentModal
          onConfirm={handleConsentConfirm}
          onCancel={handleConsentCancel}
        />
      )}
    </div>
  );
}