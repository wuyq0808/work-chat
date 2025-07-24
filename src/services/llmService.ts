import { createClaudeBedrockChatModel } from '../llm-clients/claude-bedrock.js';
import { createGeminiChatModel } from '../llm-clients/gemini.js';
import { LangChainChatHandler } from '../lib/LangChainChatHandler.js';

export type AIProvider = 'claude-bedrock' | 'gemini';

export interface AIRequest {
  input: string;
  slackToken?: string;
  azureToken?: string;
  atlassianToken?: string;
  azureName?: string;
  slackUserId?: string;
  provider?: AIProvider;
  conversationId?: string;
  timezone?: string;
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
    case 'claude-bedrock': {
      // Use LangChainChatHandler for Claude Bedrock
      if (!request.conversationId) {
        throw new Error('conversationId is required for Claude Bedrock');
      }

      const claudeBedrockModel = createClaudeBedrockChatModel();
      const claudeBedrockHandler = new LangChainChatHandler(claudeBedrockModel);
      return claudeBedrockHandler.handleChat({
        input: request.input,
        slackToken: request.slackToken,
        azureToken: request.azureToken,
        atlassianToken: request.atlassianToken,
        azureName: request.azureName,
        slackUserId: request.slackUserId,
        conversationId: request.conversationId,
        timezone: request.timezone,
        onProgress: request.onProgress,
      });
    }
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
        azureName: request.azureName,
        slackUserId: request.slackUserId,
        conversationId: request.conversationId,
        timezone: request.timezone,
        onProgress: request.onProgress,
      });
    }
    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
}
