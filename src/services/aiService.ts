import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

export type AIProvider = 'openai' | 'claude';

export interface AIRequest {
  input: string;
  slackToken: string;
  provider?: AIProvider;
}

export interface AIResponse {
  success: boolean;
  output: string;
  model: string;
  usage?: any;
  error?: string;
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  defaultHeaders: {
    'anthropic-beta': 'mcp-client-2025-04-04',
  },
});

export async function callOpenAI(request: AIRequest): Promise<AIResponse> {
  try {
    const response = await openai.responses.create({
      model: 'gpt-4o-mini',
      input: request.input,
      tools: [
        {
          type: 'mcp',
          server_label: 'slack-mcp',
          server_url: process.env.SLACK_MCP_SERVER_URL,
          headers: {
            Authorization: `Bearer ${process.env.API_KEY} ${request.slackToken}`,
          },
          require_approval: 'never',
        },
      ],
    });

    return {
      success: true,
      output: response.output_text || 'No response generated',
      model: 'gpt-4o-mini',
      usage: response.usage,
    };
  } catch (error) {
    return {
      success: false,
      output: '',
      model: 'gpt-4o-mini',
      error:
        error instanceof Error ? error.message : 'Failed to generate response',
    };
  }
}

export async function callClaude(request: AIRequest): Promise<AIResponse> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [{ role: 'user', content: request.input }],
      mcp_servers: [
        {
          type: 'url',
          url: process.env.SLACK_MCP_SERVER_URL,
          name: 'slack-mcp',
          authorization_token: `${process.env.API_KEY} ${request.slackToken}`,
        },
      ],
    } as any);

    const output = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('\n');

    return {
      success: true,
      output: output || 'No response generated',
      model: 'claude-3-5-sonnet-20241022',
      usage: response.usage,
    };
  } catch (error) {
    return {
      success: false,
      output: '',
      model: 'claude-3-5-sonnet-20241022',
      error:
        error instanceof Error ? error.message : 'Failed to generate response',
    };
  }
}

export async function callAI(request: AIRequest): Promise<AIResponse> {
  const provider = request.provider || 'openai';

  switch (provider) {
    case 'openai':
      return callOpenAI(request);
    case 'claude':
      return callClaude(request);
    default:
      return {
        success: false,
        output: '',
        model: 'unknown',
        error: `Unsupported AI provider: ${provider}`,
      };
  }
}
