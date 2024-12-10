import React from 'react';
import { Bot, User } from 'lucide-react';
import { MarkdownContent } from './MarkdownContent';

interface ChatMessageProps {
  message: string;
  isUser: boolean;
}

export function ChatMessage({ message, isUser }: ChatMessageProps) {
  return (
    <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isUser ? 'bg-bonsai-green' : 'bg-stone-200 dark:bg-stone-700'
      }`}>
        {isUser ? (
          <User className="w-5 h-5 text-white" />
        ) : (
          <Bot className="w-5 h-5 text-bonsai-green dark:text-white" />
        )}
      </div>
      <div className={`flex-1 px-4 py-2 rounded-lg ${
        isUser 
          ? 'bg-bonsai-green text-white' 
          : 'bg-stone-100 dark:bg-stone-700 text-stone-800 dark:text-stone-200'
      }`}>
        <MarkdownContent content={message} />
      </div>
    </div>
  );
}