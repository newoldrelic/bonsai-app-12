import React, { useState } from 'react';
import { Stethoscope, Crown, ArrowRight, Info, Leaf } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSubscriptionStore } from '../store/subscriptionStore';
import { HealthAnalyzer } from '../components/HealthAnalyzer';
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

  const handleAnalyze = async (imageData: string) => {
    if (!isSubscribed) {
      navigate('/pricing');
      return;
    }

    setLoading(true);
    setError(null);
    setAnalysis(null);
    setCurrentStep(0);

    try {
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
        body: JSON.stringify({ image: imageData }),
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

        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="text-xl font-semibold text-bonsai-bark dark:text-white mb-4 flex items-center gap-2">
              <Stethoscope className="w-5 h-5 text-bonsai-green" />
              <span>Upload Photo for Analysis</span>
            </h2>
            
            <div className="space-y-4">
              <HealthAnalyzer
                onAnalyze={handleAnalyze}
                loading={loading}
                error={error}
                currentStep={currentStep}
                steps={ANALYSIS_STEPS}
              />
              
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
            </div>
          </div>

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
      </div>
    </div>
  );
}