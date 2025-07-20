import { callOpenAI } from '../llmClients/openai.js';
import { callClaude } from '../llmClients/claude.js';
import { callGemini } from '../llmClients/gemini.js';

export type AIProvider = 'openai' | 'claude' | 'gemini';

export interface AIRequest {
  input: string;
  slackToken?: string;
  azureToken?: string;
  atlassianToken?: string;
  provider?: AIProvider;
}

export async function callAI(request: AIRequest): Promise<string> {
  const provider = request.provider || 'openai';

  // Validate that at least one token is provided
  if (!request.slackToken && !request.azureToken && !request.atlassianToken) {
    return 'Error: At least one token (Slack, Azure, or Atlassian) must be provided';
  }

  switch (provider) {
    case 'openai':
      return callOpenAI(request);
    case 'claude':
      return callClaude(request);
    case 'gemini':
      return callGemini(request);
    default:
      return `Error: Unsupported AI provider: ${provider}`;
  }
}
