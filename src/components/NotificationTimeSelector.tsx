import React from 'react';
import { Clock } from 'lucide-react';
import { notificationService } from '../services/notificationService';
import { debug } from '../utils/debug';

export function NotificationTimeSelector() {
  const [time, setTime] = React.useState('09:00'); // Default to 9:00 AM

  // Load saved time on mount
  React.useEffect(() => {
    const loadTime = async () => {
      try {
        const settings = await notificationService.getNotificationTime();
        const hours = settings.hours.toString().padStart(2, '0');
        const minutes = settings.minutes.toString().padStart(2, '0');
        setTime(`${hours}:${minutes}`);
      } catch (error) {
        debug.error('Failed to load notification time:', error);
      }
    };
    loadTime();
  }, []);

  const handleTimeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const [hours, minutes] = e.target.value.split(':').map(Number);
    setTime(e.target.value);
    
    try {
      await notificationService.setNotificationTime(hours, minutes);
      debug.info('Notification time updated:', { hours, minutes });
    } catch (error) {
      debug.error('Failed to update notification time:', error);
    }
  };

  return (
    <div className="flex items-center space-x-2">
      <Clock className="w-4 h-4 text-bonsai-green" />
      <input
        type="time"
        value={time}
        onChange={handleTimeChange}
        className="px-2 py-1 border border-stone-300 dark:border-stone-600 rounded focus:ring-2 focus:ring-bonsai-green focus:border-bonsai-green bg-white dark:bg-stone-900"
      />
    </div>
  );
}