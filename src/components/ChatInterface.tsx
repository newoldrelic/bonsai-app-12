import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { ChatMessage } from './ChatMessage';

interface Message {
  content: string;
  isUser: boolean;
}

interface ChatInterfaceProps {
  onSendMessage: (message: string) => Promise<string>;
}

export function ChatInterface({ onSendMessage }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([{
    content: "Hello! I'm Ken Nakamura, your bonsai expert. How can I help you today?",
    isUser: false
  }]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      const { scrollHeight, clientHeight } = chatContainerRef.current;
      chatContainerRef.current.scrollTop = scrollHeight - clientHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { content: userMessage, isUser: true }]);
    setIsLoading(true);

    try {
      const response = await onSendMessage(userMessage);
      setMessages(prev => [...prev, { content: response, isUser: false }]);
    } catch (error) {
      setMessages(prev => [...prev, { 
        content: "I apologize, but I'm having trouble responding right now. Please try again.",
        isUser: false 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[600px] md:h-[500px] bg-white dark:bg-stone-800 rounded-lg shadow-lg">
      <div 
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {messages.map((message, index) => (
          <ChatMessage 
            key={index}
            message={message.content}
            isUser={message.isUser}
          />
        ))}
        {isLoading && (
          <div className="flex items-center space-x-2 text-bonsai-green">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Ken is typing...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form 
        onSubmit={handleSubmit} 
        className="flex-shrink-0 p-4 border-t dark:border-stone-700 bg-white dark:bg-stone-800"
      >
        <div className="flex items-center gap-2 max-w-full">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about bonsai care..."
            className="flex-1 min-w-0 px-4 py-2 bg-stone-100 dark:bg-stone-700 border border-stone-200 dark:border-stone-600 rounded-lg focus:ring-2 focus:ring-bonsai-green focus:border-bonsai-green"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-bonsai-green text-white rounded-lg hover:bg-bonsai-moss transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </form>
    </div>
  );
}