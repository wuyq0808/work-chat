import {
  HumanMessage,
  ToolMessage,
  SystemMessage,
  BaseMessage,
} from '@langchain/core/messages';
import { StructuredTool } from '@langchain/core/tools';
import { SlackAPIClient } from '../mcp-servers/slack/slack-client.js';
import { SlackTools } from '../mcp-servers/slack/slack-tools.js';
import { AzureAPIClient } from '../mcp-servers/azure/azure-client.js';
import { AzureTools } from '../mcp-servers/azure/azure-tools.js';
import { AtlassianAPIClient } from '../mcp-servers/atlassian/atlassian-client.js';
import { AtlassianTools } from '../mcp-servers/atlassian/atlassian-tools.js';

export interface ChatModel {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- LangChain response types vary by model
  invoke(messages: BaseMessage[]): Promise<any>;
  bindTools(
    tools: StructuredTool[],
    options?: { parallel_tool_calls?: boolean }
  ): ChatModel;
}

export interface ToolExecutionResult {
  tool: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Tool arguments can be any shape
  args?: any;
  result?: string;
  error?: string;
}

// Global conversation histories that persist across handler instances
const conversationHistories = new Map<string, BaseMessage[]>();

function getConversationHistory(conversationId: string): BaseMessage[] {
  if (!conversationHistories.has(conversationId)) {
    conversationHistories.set(conversationId, []);
  }
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- We just set it above if not exists
  return conversationHistories.get(conversationId)!;
}

function addToConversationHistory(
  conversationId: string,
  message: BaseMessage
): void {
  const history = getConversationHistory(conversationId);
  history.push(message);
}

function createPromptEnhancementMessage(
  availableTools: StructuredTool[],
  azureName?: string,
  slackUserId?: string,
  timezone?: string
): SystemMessage {
  const toolsList = availableTools
    .map(tool => `- ${tool.name}: ${tool.description}`)
    .join('\n');

  // Build user context information
  let userContextInfo = '';
  if (azureName || slackUserId || timezone) {
    userContextInfo = '\n## USER CONTEXT\n';
    if (azureName) {
      userContextInfo += `- Azure Name: ${azureName}\n`;
    }
    if (slackUserId) {
      userContextInfo += `- Slack User ID: ${slackUserId}\n`;
    }
    if (timezone) {
      userContextInfo += `- User Timezone: ${timezone}\n`;
    }
  }

  return new SystemMessage(`You must help the user find needed information through the collaboration platforms and automatically enhance vague requests to provide useful results without asking for clarification.

Current Date/Time: ${new Date().toISOString()}
${userContextInfo}
Available tools:
${toolsList}

## FOR VAGUE REQUEST like "find me something" or "show me something important":
- Prioritize tools slack__get_latest_messages azure__get_emails_and_calendar atlassian__get_latest_activity
- Prioritize Slack, Emails, recent content
- Aim for more than 30 pieces of information if request is vague
- Concise responses
- Put upcoming meetings & events after works and discussions. 
- Do not translate, response in original language

## FOR PLATFORM-SPECIFIC REQUESTS
- "What's in my email" → Focus on Azure email tools
- "Show me Slack messages" → Focus on Slack tools
- "What's in Jira" → Focus on Atlassian Jira tools
- "Check Confluence" → Focus on Atlassian Confluence tools
- When request targets specific platform, use only that platform's tools
- Search across platforms if no platform is specified

## QUALITY ASSURANCE
- Do not display any User ID / Message ID in response
- Be persistent in finding relevant results before responding
- If initial results are poor, do additional search rounds with different approaches
- Never ask follow-up questions or suggest ways to make requests more specific`);
}

// Helper function to extract token usage from LangChain responses
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- LangChain message content varies by model
function extractTokenUsage(message: any):
  | {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
    }
  | undefined {
  // Check for usage_metadata (preferred method in LangChain 2024+)
  if (message.usage_metadata) {
    const result = {
      input_tokens: message.usage_metadata.input_tokens,
      output_tokens: message.usage_metadata.output_tokens,
      total_tokens: message.usage_metadata.total_tokens,
    };
    console.log('🔢 Extracted token usage (usage_metadata):', result);
    return result;
  }

  return undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- LangChain message content varies by model
function extractContentAsString(message: any): string {
  if (typeof message.content === 'string') {
    return message.content;
  }

  // Handle ChatBedrockConverse content format: array of content objects
  if (Array.isArray(message.content)) {
    return message.content
      .map((item: any) => {
        if (item.type === 'text' && item.text) {
          return item.text;
        }
        return '';
      })
      .join('');
  }

  return JSON.stringify(message.content);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- LangChain message content varies by model
function hasContentText(message: any): boolean {
  const contentText = extractContentAsString(message);
  return contentText.trim() !== '';
}

async function setupTools(request: {
  slackToken?: string;
  azureToken?: string;
  atlassianToken?: string;
  timezone?: string;
}): Promise<StructuredTool[]> {
  const allTools: StructuredTool[] = [];

  // Setup Slack tools
  if (request.slackToken) {
    const slackClient = new SlackAPIClient(request.slackToken);
    const slackTools = new SlackTools(slackClient);
    allTools.push(...slackTools.getTools());
  }

  // Setup Azure tools
  if (request.azureToken) {
    const azureClient = new AzureAPIClient({
      accessToken: request.azureToken,
    });
    const azureTools = new AzureTools(azureClient, request.timezone);
    allTools.push(...azureTools.getTools());
  }

  // Setup Atlassian tools
  if (request.atlassianToken) {
    const atlassianClient = new AtlassianAPIClient({
      accessToken: request.atlassianToken,
    });
    const atlassianTools = new AtlassianTools(atlassianClient);
    allTools.push(...atlassianTools.getTools());
  }

  if (allTools.length === 0) {
    throw new Error(
      'No tools were successfully initialized. Please check your tokens.'
    );
  }

  return allTools;
}

async function processResponseWithTools(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- LangChain response type varies by model
  response: any,
  tools: StructuredTool[],
  conversationId: string,
  chatModel: ChatModel,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Progress data can be any shape
  onProgress?: (event: { type: string; data: any }) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Returns LangChain message which varies by model
): Promise<any> {
  const hasToolCalls = response.tool_calls && response.tool_calls.length > 0;

  if (!hasToolCalls) {
    // No tool calls, return the original response immediately
    return response;
  }

  // Execute all tool calls in parallel using Promise.all
  const toolResults = await Promise.all(
    response.tool_calls.map(async (toolCall: any) => {
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
        return { toolCall, result: null, error };
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

        return { toolCall, result, error: null };
      } catch (error) {
        // Send progress update for tool error
        onProgress?.({
          type: 'tool_error',
          data: {
            tool: toolCall.name,
            error: String(error),
          },
        });

        return { toolCall, result: null, error: String(error) };
      }
    })
  );

  // Convert results to ToolMessages
  const toolMessages: ToolMessage[] = toolResults.map(
    ({ toolCall, result, error }) => {
      let content: string;

      if (error) {
        content = `Error executing ${toolCall.name}: ${error}`;
      } else {
        content = String(result);
      }

      return new ToolMessage({
        content,
        tool_call_id: toolCall.id,
      });
    }
  );

  // Add tool messages to conversation history
  toolMessages.forEach((toolMessage, _index) => {
    addToConversationHistory(conversationId, toolMessage);
  });

  // Get current conversation history for the final response
  const currentHistory = getConversationHistory(conversationId);

  // Must bind tools when processing tool results with parallel execution enabled
  const modelWithTools = chatModel.bindTools(tools, {
    parallel_tool_calls: true,
  });

  onProgress?.({
    type: 'ai_processing',
    data: 'Processing with AI...',
  });
  const finalResponse = await modelWithTools.invoke(currentHistory);

  addToConversationHistory(conversationId, finalResponse);

  // Extract and send token usage via progress callback
  const tokenUsage = extractTokenUsage(finalResponse);
  if (tokenUsage && onProgress) {
    onProgress({
      type: 'token_usage',
      data: tokenUsage,
    });
  }

  // Process the final response recursively to handle potential additional tool calls
  return processResponseWithTools(
    finalResponse,
    tools,
    conversationId,
    chatModel,
    onProgress
  );
}

export async function chat(
  request: {
    input: string;
    slackToken?: string;
    azureToken?: string;
    atlassianToken?: string;
    conversationId?: string;
    azureName?: string;
    slackUserId?: string;
    timezone?: string;
    onProgress?: (event: { type: string; data: any }) => void;
  },
  chatModel: ChatModel
): Promise<string> {
  const { conversationId } = request;

  if (!conversationId) {
    throw new Error('conversationId is required');
  }

  // Setup tools
  const allTools = await setupTools(request);

  // Get conversation history
  const history = getConversationHistory(conversationId);

  // Add system message at the beginning if this is a new conversation
  if (history.length === 0) {
    addToConversationHistory(
      conversationId,
      createPromptEnhancementMessage(
        allTools,
        request.azureName,
        request.slackUserId,
        request.timezone
      )
    );
  }

  // Add user message to history
  const userMessage = new HumanMessage(request.input);
  addToConversationHistory(conversationId, userMessage);

  request.onProgress?.({ type: 'status', data: 'Starting new query...' });

  // Bind tools to the model with parallel execution enabled
  const modelWithTools = chatModel.bindTools(allTools, {
    parallel_tool_calls: true,
  });

  // Get the response (which might include tool calls)
  const currentHistory = getConversationHistory(conversationId);

  request.onProgress?.({
    type: 'ai_processing',
    data: 'Processing with AI...',
  });
  const response = await modelWithTools.invoke(currentHistory);

  addToConversationHistory(conversationId, response);

  // Handle the response which may contain tool calls
  const finalAIMessage = await processResponseWithTools(
    response,
    allTools,
    conversationId,
    chatModel,
    request.onProgress
  );

  // Add final AI response to history only if it has meaningful content
  if (hasContentText(finalAIMessage)) {
    addToConversationHistory(conversationId, finalAIMessage);
  }

  // Extract and send token usage via progress callback
  const tokenUsage = extractTokenUsage(finalAIMessage);
  if (tokenUsage && request.onProgress) {
    request.onProgress({
      type: 'token_usage',
      data: tokenUsage,
    });
  }

  return extractContentAsString(finalAIMessage);
}
