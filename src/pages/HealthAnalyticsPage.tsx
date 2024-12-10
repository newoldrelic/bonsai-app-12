import React, { useState } from 'react';
import { Stethoscope, Crown, ArrowRight, AlertCircle, Loader2, Info, Leaf, TreeDeciduous } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSubscriptionStore } from '../store/subscriptionStore';
import { ImageUpload } from '../components/ImageUpload';
import { MarkdownContent } from '../components/MarkdownContent';
import { FEATURES } from '../config/features';

const feature = FEATURES.find(f => f.id === 'health-analytics')!;

const ANALYSIS_STEPS = [
  'Analyzing image quality...',
  'Identifying visible symptoms...',
  'Assessing overall health...',
  'Generating recommendations...'
];

export function HealthAnalyticsPage() {
  const navigate = useNavigate();
  const { getCurrentPlan } = useSubscriptionStore();
  const currentPlan = getCurrentPlan();
  const isSubscribed = currentPlan !== 'hobby';
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const handleImageUpload = async (file: File) => {
    if (!isSubscribed) {
      navigate('/pricing');
      return;
    }

    setLoading(true);
    setError(null);
    setAnalysis(null);
    setPreviewImage(null);
    setCurrentStep(0);

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = reader.result as string;
        setPreviewImage(base64Data);
        
        // Simulate step progression
        const stepInterval = setInterval(() => {
          setCurrentStep(prev => {
            if (prev >= ANALYSIS_STEPS.length - 1) {
              clearInterval(stepInterval);
              return prev;
            }
            return prev + 1;
          });
        }, 1500);
        
        const response = await fetch('/.netlify/functions/analyze-health', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            image: base64Data
          }),
        });

        clearInterval(stepInterval);

        if (!response.ok) {
          throw new Error('Failed to analyze image');
        }

        const data = await response.json();
        if (data.error) {
          throw new Error(data.error);
        }

        setAnalysis(data.analysis);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setError(err.message || 'Failed to analyze image');
    } finally {
      setLoading(false);
      setCurrentStep(0);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <feature.icon className="w-8 h-8 text-bonsai-green" />
            <h1 className="text-3xl font-bold text-bonsai-bark dark:text-white">
              {feature.name}
            </h1>
          </div>
          <p className="text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            {feature.description}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <div className="card p-6">
              <h2 className="text-xl font-semibold text-bonsai-bark dark:text-white mb-4 flex items-center gap-2">
                <Stethoscope className="w-5 h-5 text-bonsai-green" />
                <span>Upload Photo for Analysis</span>
              </h2>
              
              <div className="space-y-4">
                <ImageUpload onImageCapture={handleImageUpload} />
                
                {!isSubscribed && (
                  <div className="mt-4 p-4 bg-bonsai-terra/10 rounded-lg flex items-start space-x-3">
                    <Crown className="w-5 h-5 text-bonsai-terra flex-shrink-0 mt-1" />
                    <div>
                      <p className="text-bonsai-terra font-medium">Premium Feature</p>
                      <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                        Upgrade to unlock expert health analysis and treatment recommendations.
                      </p>
                      <button
                        onClick={() => navigate('/pricing')}
                        className="mt-3 text-bonsai-terra hover:text-bonsai-clay transition-colors text-sm font-medium flex items-center space-x-2"
                      >
                        <span>View Pricing</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {loading && (
                  <div className="mt-6 p-4 bg-bonsai-green/5 rounded-lg">
                    <div className="flex items-center justify-center space-x-3 text-bonsai-green mb-4">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="font-medium">{ANALYSIS_STEPS[currentStep]}</span>
                    </div>
                    <div className="w-full bg-stone-200 dark:bg-stone-700 h-2 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-bonsai-green transition-all duration-500"
                        style={{ width: `${((currentStep + 1) / ANALYSIS_STEPS.length) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {error && (
                  <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg flex items-start space-x-3">
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-red-600 dark:text-red-400 font-medium">Analysis Failed</p>
                      <p className="text-sm text-red-600 dark:text-red-400 mt-1">{error}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="card p-6">
              <h2 className="text-xl font-semibold text-bonsai-bark dark:text-white mb-4 flex items-center gap-2">
                <Info className="w-5 h-5 text-bonsai-green" />
                <span>Photo Tips</span>
              </h2>
              <ul className="space-y-3">
                <li className="flex items-start space-x-3">
                  <Leaf className="w-5 h-5 text-bonsai-green flex-shrink-0 mt-0.5" />
                  <span className="text-gray-600 dark:text-gray-300">
                    Ensure good lighting - natural daylight works best
                  </span>
                </li>
                <li className="flex items-start space-x-3">
                  <Leaf className="w-5 h-5 text-bonsai-green flex-shrink-0 mt-0.5" />
                  <span className="text-gray-600 dark:text-gray-300">
                    Capture both leaves and branches clearly
                  </span>
                </li>
                <li className="flex items-start space-x-3">
                  <Leaf className="w-5 h-5 text-bonsai-green flex-shrink-0 mt-0.5" />
                  <span className="text-gray-600 dark:text-gray-300">
                    Include the entire tree in the frame
                  </span>
                </li>
                <li className="flex items-start space-x-3">
                  <Leaf className="w-5 h-5 text-bonsai-green flex-shrink-0 mt-0.5" />
                  <span className="text-gray-600 dark:text-gray-300">
                    Take close-ups of any concerning areas
                  </span>
                </li>
              </ul>
            </div>
          </div>

          <div className="space-y-6">
            {previewImage && (
              <div className="card p-6">
                <h3 className="text-lg font-medium text-bonsai-bark dark:text-white mb-4">Uploaded Image</h3>
                <img
                  src={previewImage}
                  alt="Uploaded bonsai"
                  className="w-full h-48 object-cover rounded-lg"
                />
              </div>
            )}

            {analysis && (
              <div className="card p-6">
                <h3 className="text-lg font-medium text-bonsai-bark dark:text-white mb-4 flex items-center gap-2">
                  <Stethoscope className="w-5 h-5 text-bonsai-green" />
                  <span>Health Analysis</span>
                </h3>
                <div className="prose prose-stone dark:prose-invert">
                  <MarkdownContent content={analysis} />
                </div>
              </div>
            )}

            {!analysis && !previewImage && (
              <div className="card p-6 text-center">
                <TreeDeciduous className="w-12 h-12 text-bonsai-green/30 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-bonsai-bark dark:text-white mb-2">
                  No Analysis Yet
                </h3>
                <p className="text-gray-600 dark:text-gray-300">
                  Upload a photo of your bonsai to receive a detailed health analysis and care recommendations.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}