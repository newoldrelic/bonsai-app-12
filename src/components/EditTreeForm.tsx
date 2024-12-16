import React, { useState } from 'react';
import { X, AlertCircle, Trash2, XCircle } from 'lucide-react';
import type { BonsaiStyle, BonsaiTree } from '../types';
import { ImageUpload } from './ImageUpload';
import { StyleSelector } from './StyleSelector';
import { MaintenanceSection } from './MaintenanceSection';
import { generateMaintenanceEvents, downloadCalendarFile } from '../utils/calendar';
import { notificationService } from '../services/notificationService';
import { debug } from '../utils/debug';
import { areNotificationsEnabled } from '../utils/notifications';

interface EditTreeFormProps {
  tree: BonsaiTree;
  onClose: () => void;
  onSubmit: (id: string, updates: Partial<BonsaiTree>) => Promise<void>;
  onDelete?: (id: string) => void;
}

export function EditTreeForm({ tree, onClose, onSubmit, onDelete }: EditTreeFormProps) {
  const [formData, setFormData] = useState<BonsaiTree>({
    ...tree,
    notificationSettings: tree.notificationSettings || { hours: 9, minutes: 0 }
  });
  const [addToCalendar, setAddToCalendar] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    
    try {
      debug.info('Updating tree', { 
        treeId: tree.id,
        updates: formData
      });

      // Find notification changes
      const notificationChanges = Object.entries(formData.notifications).filter(
        ([type, enabled]) => enabled !== tree.notifications[type as keyof typeof tree.notifications]
      );

      debug.info('Processing notification changes', { 
        treeId: tree.id,
        changes: notificationChanges 
      });

      // Update tree data first
      await onSubmit(tree.id, formData);

      // Then handle notification changes if notifications are enabled
      if (notificationChanges.length > 0 && areNotificationsEnabled()) {
        for (const [type, enabled] of notificationChanges) {
          try {
            await notificationService.updateMaintenanceSchedule(
              tree.id,
              formData.name,
              type as MaintenanceType,
              enabled,
              formData.lastMaintenance?.[type],
              formData.notificationSettings
            );
            debug.info(`Updated notification schedule for ${type}`, {
              treeId: tree.id,
              enabled
            });
          } catch (error) {
            debug.error('Failed to update notification schedule:', {
              type,
              error,
              treeId: tree.id
            });
          }
        }
      }

      // Handle calendar export if requested
      if (addToCalendar) {
        try {
          const selectedTypes = (Object.entries(formData.notifications)
            .filter(([_, enabled]) => enabled)
            .map(([type]) => type)) as MaintenanceType[];

          const calendarContent = await generateMaintenanceEvents(formData, selectedTypes);
          downloadCalendarFile(calendarContent, `${formData.name}-maintenance.ics`);
        } catch (error) {
          debug.error('Failed to generate calendar events:', error);
        }
      }

      onClose();
    } catch (error) {
      debug.error('Error updating tree:', error);
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

  const handleDelete = async () => {
    if (onDelete) {
      try {
        debug.info('Starting tree deletion process', { treeId: tree.id });

        // Clean up all notifications for this tree
        const enabledTypes = Object.entries(tree.notifications)
          .filter(([_, enabled]) => enabled)
          .map(([type]) => type as MaintenanceType);
          
        debug.info('Cleaning up notifications for deleted tree:', {
          treeId: tree.id,
          enabledTypes
        });

        for (const type of enabledTypes) {
          try {
            await notificationService.updateMaintenanceSchedule(
              tree.id,
              tree.name,
              type,
              false,  // disable all notifications
              undefined,
              formData.notificationSettings
            );
            debug.info(`Disabled notifications for ${type}`, { treeId: tree.id });
          } catch (error) {
            debug.error('Failed to cleanup notification:', { type, error });
          }
        }

        // Then delete the tree
        await onDelete(tree.id);
        debug.info('Tree deleted successfully', { treeId: tree.id });
        onClose();
      } catch (error) {
        debug.error('Error deleting tree:', error);
      }
    }
  };

  const handleNotificationChange = (type: keyof typeof formData.notifications, enabled: boolean) => {
    debug.info('EditTreeForm: Notification toggle requested', { 
      treeId: tree.id,
      type, 
      enabled,
      currentState: formData.notifications[type]
    });

    // Just update form state - actual scheduling happens on save
    setFormData(prev => ({
      ...prev,
      notifications: {
        ...prev.notifications,
        [type]: enabled
      }
    }));
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
          <h2 className="text-xl font-semibold text-bonsai-bark dark:text-white">Edit {tree.name}</h2>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-2 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-full transition-colors text-red-500 hover:text-red-600"
              title="Delete tree"
            >
              <Trash2 className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-stone-100 dark:hover:bg-stone-700 rounded-full transition-colors"
              title="Close"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>
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
                />
              </div>

              <div>
                <label htmlFor="species" className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                  Species
                </label>
                <input
                  type="text"
                  id="species"
                  required
                  value={formData.species}
                  onChange={(e) => setFormData({ ...formData, species: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-bonsai-green focus:border-bonsai-green"
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
              {submitting ? 'Saving Changes...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white dark:bg-stone-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center space-x-3 text-red-500 mb-4">
              <AlertCircle className="w-6 h-6" />
              <h3 className="text-lg font-semibold">Delete Tree</h3>
            </div>
            <p className="text-stone-600 dark:text-stone-300 mb-6">
              Are you sure you want to delete {tree.name}? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                Delete Tree
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}