import React, { useEffect } from 'react';
import { PhoneCall, MessageCircle, Crown, ArrowRight, Bot, Mic, Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSubscriptionStore } from '../store/subscriptionStore';

export function ExpertCoachingPage() {
  const navigate = useNavigate();
  const { getCurrentPlan } = useSubscriptionStore();
  const currentPlan = getCurrentPlan();
  const isSubscribed = currentPlan !== 'hobby';

  useEffect(() => {
    if (!isSubscribed) return;

    // Load Play AI script
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@play-ai/web-embed';
    script.async = true;
    document.body.appendChild(script);

    // Initialize Play AI after script loads
    script.onload = () => {
      const initScript = document.createElement('script');
      initScript.textContent = `PlayAI.open('AVRe8N5e2Qj-EgOD8NeaC');`;
      document.body.appendChild(initScript);
    };

    // Cleanup
    return () => {
      document.body.removeChild(script);
      const initScript = document.querySelector('script[data-playai-init]');
      if (initScript) {
        document.body.removeChild(initScript);
      }
    };
  }, [isSubscribed]);

  if (!isSubscribed) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto text-center">
          <div className="card p-6">
            <div className="p-4 bg-bonsai-terra/10 rounded-lg flex items-start space-x-3">
              <Crown className="w-5 h-5 text-bonsai-terra flex-shrink-0 mt-1" />
              <div>
                <p className="text-bonsai-terra font-medium">Premium Feature</p>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                  Upgrade to Premium to access AI-powered expert coaching through voice and chat.
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
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <Bot className="w-8 h-8 text-bonsai-green" />
            <h1 className="text-3xl font-bold text-bonsai-bark dark:text-white">AI Expert Coaching</h1>
          </div>
          <p className="text-gray-600 dark:text-gray-300">
            Get instant guidance powered by Ken Nakamura's expert knowledge through voice or chat.
          </p>
        </div>

        <div className="card p-6">
          <h2 className="text-xl font-semibold text-bonsai-bark dark:text-white mb-4">Features</h2>
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <Bot className="w-5 h-5 text-bonsai-green flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-medium text-bonsai-bark dark:text-white">AI-Powered Expertise</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Get instant answers from an AI trained on Ken Nakamura's extensive bonsai knowledge.
                </p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <Mic className="w-5 h-5 text-bonsai-green flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-medium text-bonsai-bark dark:text-white">Voice Interaction</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Have natural conversations about your bonsai care questions.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <MessageCircle className="w-5 h-5 text-bonsai-green flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-medium text-bonsai-bark dark:text-white">24/7 Chat Support</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Get answers to your questions anytime through our chat interface.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}