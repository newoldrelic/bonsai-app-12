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
import { notificationService } from '../services/notificationService';
import { debug } from '../utils/debug';

interface AddTreeFormProps {
  onClose: () => void;
  onSubmit: (data: any, isSubscribed: boolean) => Promise<any>;  // Modified to ensure it returns a Promise
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
    },
    notificationSettings: {
      hours: 9,
      minutes: 0
    }
  });
  const [addToCalendar, setAddToCalendar] = useState(false);
  const [showSpeciesIdentifier, setShowSpeciesIdentifier] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { getCurrentPlan } = useSubscriptionStore();
  const currentPlan = getCurrentPlan();
  const isSubscribed = currentPlan.id !== 'hobby';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    
    setSubmitting(true);
    
    try {
      debug.info('Submitting new tree form', { 
        formData,
        enabledNotifications: Object.entries(formData.notifications).filter(([_, enabled]) => enabled)
      });

      // Submit the form data and get the created tree back
      const createdTree = await onSubmit(formData, isSubscribed);
      
      debug.info('Tree created successfully', { createdTree });

      // Now setup notifications with the real tree ID
      const enabledNotifications = Object.entries(formData.notifications)
        .filter(([_, enabled]) => enabled);
        
      debug.info('Setting up notifications for new tree:', {
        treeId: createdTree.id,
        enabledNotifications
      });

      for (const [type, enabled] of enabledNotifications) {
        try {
          await notificationService.updateMaintenanceSchedule(
            createdTree.id,
            createdTree.name,
            type as MaintenanceType,
            enabled,
            undefined,
            formData.notificationSettings
          );
          debug.info(`Notification scheduled for ${type}`, {
            treeId: createdTree.id,
            type,
            settings: formData.notificationSettings
          });
        } catch (error) {
          debug.error('Failed to setup notification:', { type, error });
        }
      }

      if (addToCalendar) {
        try {
          const selectedTypes = (Object.entries(formData.notifications)
            .filter(([_, enabled]) => enabled)
            .map(([type]) => type)) as MaintenanceType[];

          const calendarContent = await generateMaintenanceEvents(
            { ...formData, id: createdTree.id, maintenanceLogs: [], userEmail: '' },
            selectedTypes
          );
          downloadCalendarFile(calendarContent, `${formData.name}-maintenance.ics`);
        } catch (error) {
          debug.error('Failed to generate calendar events:', error);
        }
      }
    } catch (error) {
      debug.error('Error submitting form:', error);
    } finally {
      setSubmitting(false);
    }
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

  const handleNotificationChange = async (type: keyof typeof formData.notifications, enabled: boolean) => {
    try {
      debug.info('AddTreeForm: Notification toggle requested', { type, enabled });
      
      // Just update the form state - we'll setup notifications after tree creation
      setFormData(prev => ({
        ...prev,
        notifications: {
          ...prev.notifications,
          [type]: enabled
        }
      }));
      
      debug.info('AddTreeForm: Notification state updated:', { type, enabled });
    } catch (error) {
      debug.error('AddTreeForm: Error updating notification state:', error);
      
      // Revert on error
      setFormData(prev => ({
        ...prev,
        notifications: {
          ...prev.notifications,
          [type]: !enabled
        }
      }));
    }
  };

  const handleNotificationTimeChange = (hours: number, minutes: number) => {
    setFormData(prev => ({
      ...prev,
      notificationSettings: { hours, minutes }
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-6">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                  Tree Name
                </label>
                <input
                  type="text"
                  id="name"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-bonsai-green focus:border-bonsai-green"
                  placeholder="Give your bonsai a name"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="species" className="block text-sm font-medium text-stone-700 dark:text-stone-300">
                    Species
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowSpeciesIdentifier(true)}
                    className="text-sm text-bonsai-green hover:text-bonsai-moss transition-colors"
                  >
                    Species Identifier
                  </button>
                </div>
                <input
                  type="text"
                  id="species"
                  required
                  value={formData.species}
                  onChange={(e) => setFormData({ ...formData, species: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-bonsai-green focus:border-bonsai-green"
                  placeholder="e.g., Japanese Maple, Chinese Elm"
                />
              </div>

              <div>
                <label htmlFor="dateAcquired" className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                  Date Acquired
                </label>
                <input
                  type="date"
                  id="dateAcquired"
                  required
                  value={formData.dateAcquired}
                  onChange={(e) => setFormData({ ...formData, dateAcquired: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-bonsai-green focus:border-bonsai-green"
                />
              </div>

              <div>
                <label htmlFor="notes" className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                  Notes
                </label>
                <textarea
                  id="notes"
                  rows={3}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-bonsai-green focus:border-bonsai-green"
                  placeholder="Add any notes about your bonsai..."
                />
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-3">
                  Style
                </label>
                <StyleSelector
                  value={formData.style}
                  onChange={(style) => setFormData({ ...formData, style })}
                />
              </div>

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
          </div>

          <MaintenanceSection
            notifications={formData.notifications}
            notificationTime={formData.notificationSettings}
            onNotificationChange={handleNotificationChange}
            onNotificationTimeChange={handleNotificationTimeChange}
            addToCalendar={addToCalendar}
            onAddToCalendarChange={setAddToCalendar}
          />

          <div className="pt-4 border-t border-stone-200 dark:border-stone-700">
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-bonsai-green text-white px-4 py-2 rounded-lg hover:bg-bonsai-moss transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Adding Tree...' : 'Add Tree'}
            </button>
          </div>
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