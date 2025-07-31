import { AIMessage } from '@langchain/core/messages';
import { StructuredTool } from '@langchain/core/tools';
import type { ToolCall } from '@langchain/core/messages/tool';
import type { MessageContent } from '@langchain/core/messages';
import type { ProgressCallback } from '../types/progress.js';

// Re-export for convenience
export type { ProgressCallback } from '../types/progress.js';
import { SlackAPIClient } from '../mcp-servers/slack/slack-client.js';
import { SlackTools } from '../mcp-servers/slack/slack-tools.js';
import { AzureAPIClient } from '../mcp-servers/azure/azure-client.js';
import { AzureTools } from '../mcp-servers/azure/azure-tools.js';
import { AtlassianAPIClient } from '../mcp-servers/atlassian/atlassian-client.js';
import { AtlassianTools } from '../mcp-servers/atlassian/atlassian-tools.js';
import { CombinedTools } from '../mcp-servers/combined/combined-tools.js';

export interface ToolCallExecutionResult {
  toolCall: ToolCall;
  result: string;
  error: string;
}

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
  onProgress?: ProgressCallback
): void {
  const totalTokens = getTokenUsage(message);
  if (onProgress) {
    onProgress({
      type: 'token_usage',
      data: totalTokens,
    });
  }
}

export async function executeToolCall(
  toolCall: ToolCall,
  tools: StructuredTool[],
  onProgress?: ProgressCallback
): Promise<ToolCallExecutionResult> {
  const tool = tools.find(t => t.name === toolCall.name);

  if (!tool) {
    const error = `Tool ${toolCall.name} not found`;
    onProgress?.({
      type: 'tool_error',
      data: {
        tool: toolCall.name,
        error,
      },
    });
    return { toolCall, result: '', error };
  }

  // Send progress update for tool execution start
  onProgress?.({
    type: 'tool_start',
    data: {
      tool: toolCall.name,
      args: toolCall.args,
    },
  });

  try {
    const result = await tool.invoke(toolCall.args);

    // Send progress update for tool completion
    onProgress?.({
      type: 'tool_complete',
      data: {
        tool: toolCall.name,
      },
    });

    return { toolCall, result, error: '' };
  } catch (error) {
    // Send progress update for tool error
    onProgress?.({
      type: 'tool_error',
      data: {
        tool: toolCall.name,
        error: String(error),
      },
    });

    return { toolCall, result: '', error: String(error) };
  }
}

export async function setupTools(request: {
  slackToken?: string;
  azureToken?: string;
  atlassianToken?: string;
  timezone?: string;
}): Promise<StructuredTool[]> {
  const allTools: StructuredTool[] = [];
  let slackTools: SlackTools | undefined;
  let azureTools: AzureTools | undefined;
  let atlassianTools: AtlassianTools | undefined;

  // Setup Slack tools
  if (request.slackToken) {
    const slackClient = new SlackAPIClient(request.slackToken);
    slackTools = new SlackTools(slackClient);
    allTools.push(...slackTools.getTools());
  }

  // Setup Azure tools
  if (request.azureToken) {
    const azureClient = new AzureAPIClient({
      accessToken: request.azureToken,
    });
    azureTools = new AzureTools(azureClient, request.timezone);
    allTools.push(...azureTools.getTools());
  }

  // Setup Atlassian tools
  if (request.atlassianToken) {
    const atlassianClient = new AtlassianAPIClient({
      accessToken: request.atlassianToken,
    });
    atlassianTools = new AtlassianTools(atlassianClient);
    allTools.push(...atlassianTools.getTools());
  }

  // Setup Combined tools (only if at least one platform is available)
  if (slackTools || azureTools || atlassianTools) {
    const combinedTools = new CombinedTools(
      slackTools,
      azureTools,
      atlassianTools
    );
    allTools.push(...combinedTools.getTools());
  }

  if (allTools.length === 0) {
    throw new Error(
      'No tools were successfully initialized. Please check your tokens.'
    );
  }

  return allTools;
}
