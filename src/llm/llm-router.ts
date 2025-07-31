import { claudeBedrock } from './clients/claude-bedrock.js';
import { chat } from '../llm/chat.js';
import { AWSConfig } from '../utils/secrets-manager.js';
import type { ChatRequest } from '../types/chat.js';

const AI_PROVIDERS = {
  CLAUDE_BEDROCK_37: 'claude-bedrock-37',
  CLAUDE_BEDROCK_35: 'claude-bedrock-35',
} as const;

export type AIProvider = (typeof AI_PROVIDERS)[keyof typeof AI_PROVIDERS];

function validateAIProvider(value: string | undefined): value is AIProvider {
  if (!value) return false;
  return Object.values(AI_PROVIDERS).includes(value as AIProvider);
}

async function handleClaudeBedrockChat(
  request: ChatRequest,
  version: '35' | '37',
  awsConfig: AWSConfig
): Promise<string> {
  const claudeBedrockModel = claudeBedrock(version, awsConfig);
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
  if (
    !request.oauthCredentials.slackToken &&
    !request.oauthCredentials.azureToken &&
    !request.oauthCredentials.atlassianToken
  ) {
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
