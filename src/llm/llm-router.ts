import { RetryableClaudeBedrockChat } from '../llm-clients/claude-bedrock.js';
import { chat } from '../llm/chat.js';
import { AWSConfig } from '../utils/secrets-manager.js';

const AI_PROVIDERS = {
  CLAUDE_BEDROCK_37: 'claude-bedrock-37',
  CLAUDE_BEDROCK_35: 'claude-bedrock-35',
} as const;

export type AIProvider = (typeof AI_PROVIDERS)[keyof typeof AI_PROVIDERS];

function validateAIProvider(value: string | undefined): value is AIProvider {
  if (!value) return false;
  return Object.values(AI_PROVIDERS).includes(value as AIProvider);
}

export interface ChatRequest {
  input: string;
  slackToken?: string;
  azureToken?: string;
  atlassianToken?: string;
  azureName?: string;
  slackUserId?: string;
  provider?: string;
  conversationId?: string;
  timezone?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Progress data can be any shape
  onProgress?: (event: { type: string; data: any }) => void;
}

async function handleClaudeBedrockChat(
  request: ChatRequest,
  version: '35' | '37',
  awsConfig: AWSConfig
): Promise<string> {
  if (!request.conversationId) {
    throw new Error('conversationId is required for Claude Bedrock');
  }

  const claudeBedrockModel = new RetryableClaudeBedrockChat(version, awsConfig);
  return chat(request, claudeBedrockModel);
}

export async function handleChatRequest(
  request: ChatRequest,
  awsConfig: AWSConfig
): Promise<string> {
  const provider = request.provider;

  // Validate provider
  if (!validateAIProvider(provider)) {
    throw new Error(
      `Invalid AI provider: ${provider}. Must be one of: ${Object.values(AI_PROVIDERS).join(', ')}`
    );
  }

  // Validate that at least one token is provided
  if (!request.slackToken && !request.azureToken && !request.atlassianToken) {
    throw new Error(
      'At least one token (Slack, Azure, or Atlassian) must be provided'
    );
  }

  switch (provider) {
    case 'claude-bedrock-37':
      return handleClaudeBedrockChat(request, '37', awsConfig);
    case 'claude-bedrock-35':
      return handleClaudeBedrockChat(request, '35', awsConfig);
    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
}
