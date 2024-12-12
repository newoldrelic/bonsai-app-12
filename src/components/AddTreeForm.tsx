import React, { useState } from 'react';
import { X, AlertCircle } from 'lucide-react';
import type { BonsaiStyle } from '../types';
import { ImageUpload } from './ImageUpload';
import { SpeciesIdentifierModal } from './SpeciesIdentifierModal';
import { StyleSelector } from './StyleSelector';
import { MaintenanceSection } from './MaintenanceSection';
import { generateMaintenanceEvents, downloadCalendarFile } from '../utils/calendar';
import { requestNotificationPermission, areNotificationsEnabled } from '../utils/notifications';
import { useSubscriptionStore } from '../store/subscriptionStore';

interface AddTreeFormProps {
  onClose: () => void;
  onSubmit: (data: any, isSubscribed: boolean) => void;
}

export function AddTreeForm({ onClose, onSubmit }: AddTreeFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    species: '',
    style: 'Chokkan' as BonsaiStyle,
    dateAcquired: new Date().toISOString().split('T')[0],
    images: [] as string[],
    notes: '',
    notifications: {
      watering: false,
      fertilizing: false,
      pruning: false,
      wiring: false,
      repotting: false
    }
  });
  const [addToCalendar, setAddToCalendar] = useState(false);
  const [showSpeciesIdentifier, setShowSpeciesIdentifier] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const { getCurrentPlan } = useSubscriptionStore();
  const currentPlan = getCurrentPlan();
  const isSubscribed = currentPlan.id !== 'hobby';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (Object.values(formData.notifications).some(value => value)) {
      if (!areNotificationsEnabled()) {
        const granted = await requestNotificationPermission();
        if (!granted) {
          const confirmed = window.confirm(
            'Notifications are required for maintenance reminders. Would you like to enable them in your browser settings?'
          );
          if (!confirmed) {
            setFormData(prev => ({
              ...prev,
              notifications: Object.keys(prev.notifications).reduce((acc, key) => ({
                ...acc,
                [key]: false
              }), {} as typeof prev.notifications)
            }));
          }
        }
      }
    }

    if (addToCalendar) {
      try {
        const selectedTypes = (Object.entries(formData.notifications)
          .filter(([_, enabled]) => enabled)
          .map(([type]) => type)) as MaintenanceType[];

        const calendarContent = await generateMaintenanceEvents(
          { ...formData, id: crypto.randomUUID(), maintenanceLogs: [], userEmail: '' },
          selectedTypes
        );
        downloadCalendarFile(calendarContent, `${formData.name}-maintenance.ics`);
      } catch (error) {
        console.error('Failed to generate calendar events:', error);
      }
    }

    onSubmit(formData, isSubscribed);
  };

  const handleImageCapture = (dataUrl: string) => {
    setImageError(null);
    setFormData(prev => ({
      ...prev,
      images: [...prev.images, dataUrl]
    }));
  };

  const handleImageError = (error: string) => {
    setImageError(error);
  };

  const handleSpeciesIdentified = (species: string) => {
    setFormData(prev => ({
      ...prev,
      species
    }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-stone-800 rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-stone-200 dark:border-stone-700 sticky top-0 bg-white dark:bg-stone-800">
          <h2 className="text-xl font-semibold text-bonsai-bark dark:text-white">Add New Bonsai</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-stone-100 dark:hover:bg-stone-700 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-stone-500 dark:text-stone-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* ... other form fields ... */}

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                Tree Photo
              </label>
              <ImageUpload 
                onImageCapture={handleImageCapture}
                onError={handleImageError}
              />
              
              {imageError && (
                <div className="mt-2 flex items-start space-x-2 text-red-600 dark:text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{imageError}</span>
                </div>
              )}
              
              {formData.images.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {formData.images.map((image, index) => (
                    <div key={index} className="relative">
                      <img
                        src={image}
                        alt={`Tree photo ${index + 1}`}
                        className="w-full h-24 object-cover rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({
                          ...prev,
                          images: prev.images.filter((_, i) => i !== index)
                        }))}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ... rest of the form ... */}
        </form>
      </div>

      {showSpeciesIdentifier && (
        <SpeciesIdentifierModal
          onClose={() => setShowSpeciesIdentifier(false)}
          onSpeciesIdentified={handleSpeciesIdentified}
        />
      )}
    </div>
  );
}