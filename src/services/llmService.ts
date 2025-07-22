import { callOpenAI } from '../llm-clients/openai.js';
import { callClaude } from '../llm-clients/claude.js';
import { callClaudeBedrock } from '../llm-clients/claude-bedrock.js';
import { callGemini, callGeminiWithStream } from '../llm-clients/gemini.js';

export type AIProvider = 'openai' | 'claude' | 'claude-bedrock' | 'gemini';

export interface AIRequest {
  input: string;
  slackToken?: string;
  azureToken?: string;
  atlassianToken?: string;
  provider?: AIProvider;
  conversationId?: string;
}

export interface StreamingAIRequest extends AIRequest {
  onProgress?: (event: { type: string; data: any }) => void;
}


export async function callAIWithStream(
  request: StreamingAIRequest
): Promise<string> {
  const provider = request.provider || 'openai';

  // Validate that at least one token is provided
  if (!request.slackToken && !request.azureToken && !request.atlassianToken) {
    throw new Error(
      'At least one token (Slack, Azure, or Atlassian) must be provided'
    );
  }

  switch (provider) {
    case 'openai':
      // For now, OpenAI doesn't support streaming with progress
      request.onProgress?.({
        type: 'status',
        data: 'Processing with OpenAI...',
      });
      return callOpenAI(request);
    case 'claude':
      // For now, Claude doesn't support streaming with progress
      request.onProgress?.({
        type: 'status',
        data: 'Processing with Claude...',
      });
      return callClaude(request);
    case 'claude-bedrock':
      // For now, Claude Bedrock doesn't support streaming with progress
      request.onProgress?.({
        type: 'status',
        data: 'Processing with Claude on AWS Bedrock...',
      });
      return callClaudeBedrock(request);
    case 'gemini':
      return callGeminiWithStream(request);
    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
}
