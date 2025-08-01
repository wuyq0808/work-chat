import { AIMessage } from '@langchain/core/messages';
import type { MessageContent } from '@langchain/core/messages';
import type { ProgressCallback } from '../types/progress.js';

export function formatMessageContent(content: MessageContent): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map(block => {
        if (typeof block === 'string') {
          return block;
        }

        if (block.type === 'text' && 'text' in block) {
          return block.text;
        }

        if (block.type === 'image_url' && 'image_url' in block) {
          const imageUrl =
            typeof block.image_url === 'string'
              ? block.image_url
              : block.image_url.url;
          return `[Image: ${imageUrl}]`;
        }

        return JSON.stringify(block);
      })
      .join('');
  }

  return JSON.stringify(content);
}

// Helper function to extract total token usage from LangChain responses
export function getTokenUsage(message: AIMessage): number {
  // Check for usage_metadata (preferred method in LangChain 2024+)
  if (message.usage_metadata) {
    return message.usage_metadata.total_tokens || 0;
  }

  return 0;
}

// Helper function to update token usage via progress callback
export function updateTokenUsage(
  message: AIMessage,
  onProgress: ProgressCallback
): void {
  const totalTokens = getTokenUsage(message);
  onProgress({
    type: 'token_usage',
    data: totalTokens,
  });
}
