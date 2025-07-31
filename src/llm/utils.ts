import { AIMessage } from '@langchain/core/messages';
import { StructuredTool } from '@langchain/core/tools';
import type { ToolCall } from '@langchain/core/messages/tool';

export interface ToolCallExecutionResult {
  toolCall: ToolCall;
  result: string;
  error: string;
}

// Helper function to extract token usage from LangChain responses
export function getTokenUsage(message: AIMessage): {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
} {
  // Check for usage_metadata (preferred method in LangChain 2024+)
  if (message.usage_metadata) {
    return {
      input_tokens: message.usage_metadata.input_tokens || 0,
      output_tokens: message.usage_metadata.output_tokens || 0,
      total_tokens: message.usage_metadata.total_tokens || 0,
    };
  }

  return {
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
  };
}

// Helper function to update token usage via progress callback
export function updateTokenUsage(
  message: AIMessage,
  onProgress?: (event: { type: string; data: any }) => void
): void {
  const tokenUsage = getTokenUsage(message);
  if (onProgress) {
    onProgress({
      type: 'token_usage',
      data: tokenUsage,
    });
  }
}

export async function executeToolCall(
  toolCall: ToolCall,
  tools: StructuredTool[],
  onProgress?: (event: { type: string; data: any }) => void
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
