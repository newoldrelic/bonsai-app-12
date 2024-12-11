import React, { useState } from 'react';
import { Leaf, TreeDeciduous, Crown, Download, Stethoscope } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSubscriptionStore } from '../store/subscriptionStore';
import { HealthAnalyzer } from '../components/HealthAnalyzer';
import { MarkdownContent } from '../components/MarkdownContent';
import { downloadText, formatAnalysisForDownload } from '../utils/download';
import { FEATURES } from '../config/features';

const feature = FEATURES.find(f => f.id === 'health-analytics')!;

const ANALYSIS_STEPS = [
  'Initializing health analysis...',
  'Examining leaf condition...',
  'Checking for signs of disease...',
  'Analyzing overall vigor...',
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
    setCurrentStep(0);

    const stepInterval = setInterval(() => {
      setCurrentStep(current => (current < ANALYSIS_STEPS.length - 1 ? current + 1 : current));
    }, 2000);

    try {
      const response = await fetch('/.netlify/functions/analyze-health', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: imageData
        }),
      });

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
      clearInterval(stepInterval);
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <feature.icon className="w-8 h-8 text-bonsai-green" />
            <h1 className="text-3xl font-bold text-bonsai-bark dark:text-white">
              {feature.name}
            </h1>
          </div>
          <p className="text-gray-600 dark:text-gray-300">
            {feature.description}
          </p>
        </div>

        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="text-xl font-semibold text-bonsai-bark dark:text-white mb-4">
              Analyze Your Bonsai's Health
            </h2>
            
            <HealthAnalyzer
              onAnalyze={handleAnalyze}
              loading={loading}
              error={error}
              currentStep={currentStep}
              steps={ANALYSIS_STEPS}
            />
          </div>

          {analysis && (
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-bonsai-bark dark:text-white flex items-center gap-2">
                  <Stethoscope className="w-5 h-5 text-bonsai-green" />
                  <span>Health Analysis</span>
                </h3>
                <button
                  onClick={() => {
                    const formattedContent = formatAnalysisForDownload(analysis, 'health');
                    downloadText(formattedContent, `bonsai-health-analysis-${Date.now()}.txt`);
                  }}
                  className="text-sm text-stone-500 dark:text-stone-400 hover:text-bonsai-green dark:hover:text-bonsai-green flex items-center gap-1 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Download analysis</span>
                </button>
              </div>
              <div className="prose prose-stone dark:prose-invert">
                <MarkdownContent content={analysis} />
              </div>
            </div>
          )}

          <div className="card p-6">
            <h2 className="text-xl font-semibold text-bonsai-bark dark:text-white mb-4">
              Common Health Issues
            </h2>
            <div className="space-y-4">
              <div className="p-4 bg-bonsai-green/10 rounded-lg">
                <h3 className="font-medium text-bonsai-bark dark:text-white mb-2">
                  Leaf Problems
                </h3>
                <p className="text-gray-600 dark:text-gray-300 text-sm">
                  Yellowing, browning, or dropping leaves can indicate watering issues or nutrient deficiencies.
                </p>
              </div>
              <div className="p-4 bg-bonsai-green/10 rounded-lg">
                <h3 className="font-medium text-bonsai-bark dark:text-white mb-2">
                  Root Health
                </h3>
                <p className="text-gray-600 dark:text-gray-300 text-sm">
                  Root rot, compacted soil, or poor drainage can affect your tree's overall health.
                </p>
              </div>
              <div className="p-4 bg-bonsai-green/10 rounded-lg">
                <h3 className="font-medium text-bonsai-bark dark:text-white mb-2">
                  Pest Infestations
                </h3>
                <p className="text-gray-600 dark:text-gray-300 text-sm">
                  Spider mites, scale insects, or other pests can damage your bonsai's health.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}