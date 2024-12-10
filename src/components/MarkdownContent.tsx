import React from 'react';

interface MarkdownContentProps {
  content: string;
  className?: string;
}

export function MarkdownContent({ content, className = '' }: MarkdownContentProps) {
  const formatMarkdown = (text: string) => {
    // Split into lines for block-level formatting
    const lines = text.split('\n');
    
    return lines.map((line, index) => {
      // Headers
      if (line.startsWith('### ')) {
        return (
          <h3 key={index} className="text-lg font-semibold mt-4 mb-2">
            {line.replace('### ', '')}
          </h3>
        );
      }
      if (line.startsWith('## ')) {
        return (
          <h2 key={index} className="text-xl font-semibold mt-4 mb-2">
            {line.replace('## ', '')}
          </h2>
        );
      }
      if (line.startsWith('# ')) {
        return (
          <h1 key={index} className="text-2xl font-bold mt-4 mb-2">
            {line.replace('# ', '')}
          </h1>
        );
      }

      // Lists
      if (line.startsWith('- ')) {
        return (
          <li key={index} className="ml-4 flex items-center space-x-2 my-1">
            <span className="w-1.5 h-1.5 bg-current rounded-full flex-shrink-0" />
            <span>{line.replace('- ', '')}</span>
          </li>
        );
      }
      if (line.match(/^\d+\. /)) {
        return (
          <li key={index} className="ml-4 list-decimal my-1">
            {line.replace(/^\d+\. /, '')}
          </li>
        );
      }

      // Bold and Italic inline formatting
      const formattedLine = line
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code>$1</code>');

      // Empty lines become breaks
      if (!line.trim()) {
        return <br key={index} />;
      }

      // Regular paragraphs
      return (
        <p 
          key={index} 
          className="my-2"
          dangerouslySetInnerHTML={{ __html: formattedLine }}
        />
      );
    });
  };

  return (
    <div className={`prose prose-stone dark:prose-invert max-w-none ${className}`}>
      {formatMarkdown(content)}
    </div>
  );
}