import type { ProgressCallback } from './progress.js';
import type { ToolCall } from '@langchain/core/messages/tool';

export interface OAuthCredentials {
  slackToken?: string;
  slackUserId?: string;
  azureToken?: string;
  azureName?: string;
  atlassianToken?: string;
  githubToken?: string;
}

export interface ChatRequest {
  input: string;
  provider: string;
  conversationId: string;
  timezone: string;
  onProgress: ProgressCallback;
  oauthCredentials: OAuthCredentials;
}

export interface ToolCallExecutionResult {
  toolCall: ToolCall;
  result: string;
  error: string;
}
