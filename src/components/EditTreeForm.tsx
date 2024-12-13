import React, { useState } from 'react';
import { X, AlertCircle, Trash2, XCircle } from 'lucide-react';
import type { BonsaiStyle, BonsaiTree } from '../types';
import { ImageUpload } from './ImageUpload';
import { StyleSelector } from './StyleSelector';
import { MaintenanceSection } from './MaintenanceSection';
import { generateMaintenanceEvents, downloadCalendarFile } from '../utils/calendar';
import { notificationService } from '../services/notificationService';
import { debug } from '../utils/debug';

interface EditTreeFormProps {
  tree: BonsaiTree;
  onClose: () => void;
  onSubmit: (id: string, updates: Partial<BonsaiTree>) => void;
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
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

    // Update notification schedules for each maintenance type
    try {
      const notificationChanges = Object.entries(formData.notifications).filter(
        ([type, enabled]) => enabled !== tree.notifications[type as keyof typeof tree.notifications]
      );

      for (const [type, enabled] of notificationChanges) {
        await notificationService.updateMaintenanceSchedule(
          tree.id,
          formData.name,
          type as MaintenanceType,
          enabled,
          formData.lastMaintenance?.[type]
        );
      }
    } catch (error) {
      debug.error('Failed to update notification schedules:', error);
    }

    onSubmit(tree.id, formData);
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

  const handleDelete = () => {
    if (onDelete) {
      onDelete(tree.id);
    }
  };

  const handleNotificationChange = async (type: keyof typeof formData.notifications, enabled: boolean) => {
    try {
      setFormData(prev => ({
        ...prev,
        notifications: {
          ...prev.notifications,
          [type]: enabled
        }
      }));

      await notificationService.updateMaintenanceSchedule(
        tree.id,
        formData.name,
        type as MaintenanceType,
        enabled,
        formData.lastMaintenance?.[type],
        formData.notificationSettings
      );
    } catch (error) {
      debug.error('Failed to update notification:', error);
      // Revert the change if update fails
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
              className="w-full bg-bonsai-green text-white px-4 py-2 rounded-lg hover:bg-bonsai-moss transition-colors"
            >
              Save Changes
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