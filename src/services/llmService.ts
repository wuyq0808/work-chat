import { callClaudeBedrock } from '../llm-clients/claude-bedrock.js';
import { createGeminiChatModel } from '../llm-clients/gemini.js';
import { LangChainChatHandler } from '../lib/LangChainChatHandler.js';

export type AIProvider = 'claude-bedrock' | 'gemini';

export interface AIRequest {
  input: string;
  slackToken?: string;
  azureToken?: string;
  atlassianToken?: string;
  provider?: AIProvider;
  conversationId?: string;
}

export interface StreamingAIRequest extends AIRequest {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Progress data can be any shape
  onProgress?: (event: { type: string; data: any }) => void;
}

export async function callAIWithStream(
  request: StreamingAIRequest
): Promise<string> {
  const provider = request.provider || 'gemini';

  // Validate that at least one token is provided
  if (!request.slackToken && !request.azureToken && !request.atlassianToken) {
    throw new Error(
      'At least one token (Slack, Azure, or Atlassian) must be provided'
    );
  }

  switch (provider) {
    case 'claude-bedrock':
      // For now, Claude Bedrock doesn't support streaming with progress
      request.onProgress?.({
        type: 'status',
        data: 'Processing with Claude on AWS Bedrock...',
      });
      return callClaudeBedrock(request);
    case 'gemini': {
      // Use LangChainChatHandler for Gemini
      if (!request.conversationId) {
        throw new Error('conversationId is required for Gemini');
      }
      const geminiModel = createGeminiChatModel();
      const geminiHandler = new LangChainChatHandler(geminiModel);
      return geminiHandler.handleChat({
        input: request.input,
        slackToken: request.slackToken,
        azureToken: request.azureToken,
        atlassianToken: request.atlassianToken,
        conversationId: request.conversationId,
        onProgress: request.onProgress,
      });
    }
    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
}
