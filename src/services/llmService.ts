import { RetryableClaudeBedrockChat } from '../llm-clients/claude-bedrock.js';
import { LangChainChatHandler } from '../lib/LangChainChatHandler.js';

export type AIProvider = 'claude-bedrock-37' | 'claude-bedrock-35';

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

async function handleClaudeBedrockChat(
  request: StreamingAIRequest,
  version: '35' | '37'
): Promise<string> {
  if (!request.conversationId) {
    throw new Error('conversationId is required for Claude Bedrock');
  }

  const claudeBedrockModel = new RetryableClaudeBedrockChat(version);
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

export async function callAIWithStream(
  request: StreamingAIRequest
): Promise<string> {
  const provider = request.provider || 'claude-bedrock-37';

  // Validate that at least one token is provided
  if (!request.slackToken && !request.azureToken && !request.atlassianToken) {
    throw new Error(
      'At least one token (Slack, Azure, or Atlassian) must be provided'
    );
  }

  switch (provider) {
    case 'claude-bedrock-37':
      return handleClaudeBedrockChat(request, '37');
    case 'claude-bedrock-35':
      return handleClaudeBedrockChat(request, '35');
    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
}
