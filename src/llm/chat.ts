import {
  HumanMessage,
  ToolMessage,
  SystemMessage,
  BaseMessage,
  AIMessage,
  mapChatMessagesToStoredMessages,
  mapStoredMessagesToChatMessages,
} from '@langchain/core/messages';
import type { ToolCall } from '@langchain/core/messages/tool';
import { StructuredTool } from '@langchain/core/tools';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { summarizeConversationHistory } from './conversation-summarizer.js';
import {
  getTokenUsage,
  updateTokenUsage,
  executeToolCall,
  ToolCallExecutionResult,
} from './utils.js';
import Keyv from 'keyv';
import KeyvSqlite from '@keyv/sqlite';
import { SlackAPIClient } from '../mcp-servers/slack/slack-client.js';
import { SlackTools } from '../mcp-servers/slack/slack-tools.js';
import { AzureAPIClient } from '../mcp-servers/azure/azure-client.js';
import { AzureTools } from '../mcp-servers/azure/azure-tools.js';
import { AtlassianAPIClient } from '../mcp-servers/atlassian/atlassian-client.js';
import { AtlassianTools } from '../mcp-servers/atlassian/atlassian-tools.js';
import { CombinedTools } from '../mcp-servers/combined/combined-tools.js';

export interface ToolExecutionResult {
  tool: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Tool arguments can be any shape
  args?: any;
  result?: string;
  error?: string;
}

const TOKEN_LIMIT_FOR_SUMMARIZATION = 20000;

// Persistent conversation histories using Keyv with SQLite and LangChain serialization
const conversationStore = new Keyv(
  new KeyvSqlite('sqlite://conversations.sqlite'),
  {
    namespace: 'conversations',
    ttl: 1000 * 60 * 60 * 24, // 1 day TTL
  }
);

// Handle storage errors
conversationStore.on('error', err => {
  console.error('Conversation storage error:', err);
});

async function getConversationHistory(
  conversationId: string
): Promise<BaseMessage[]> {
  const serializedMessages = await conversationStore.get(conversationId);
  if (!serializedMessages) {
    return [];
  }
  return mapStoredMessagesToChatMessages(serializedMessages);
}

async function addToConversationHistory(
  conversationId: string,
  message: BaseMessage
): Promise<void> {
  const history = await getConversationHistory(conversationId);
  history.push(message);
  const serializedMessages = mapChatMessagesToStoredMessages(history);
  await conversationStore.set(conversationId, serializedMessages);
}

function createSystemMessage(
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
- Prioritize cross-platform tools
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

function shouldSummarize(tokenUsage: {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}): boolean {
  return tokenUsage.total_tokens > TOKEN_LIMIT_FOR_SUMMARIZATION;
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

async function setupTools(request: {
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

async function processResponseWithTools(
  response: AIMessage,
  tools: StructuredTool[],
  conversationId: string,
  chatModel: BaseChatModel,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Progress data can be any shape
  onProgress?: (event: { type: string; data: any }) => void
): Promise<AIMessage> {
  const toolCalls = response.tool_calls;

  if (!toolCalls || toolCalls.length === 0) {
    // No tool calls, return the original response immediately
    return response;
  }

  // Execute all tool calls in parallel using Promise.all
  const toolResults: ToolCallExecutionResult[] = await Promise.all(
    toolCalls.map((toolCall: ToolCall) =>
      executeToolCall(toolCall, tools, onProgress)
    )
  );

  // Convert results to ToolMessages
  const toolMessages: ToolMessage[] = toolResults.map(
    ({ toolCall, result, error }) => {
      const content = error
        ? `Error executing ${toolCall.name}: ${error}`
        : result;

      return new ToolMessage({
        content,
        tool_call_id: toolCall.id || '',
      });
    }
  );

  // Add tool messages to conversation history
  for (const toolMessage of toolMessages) {
    await addToConversationHistory(conversationId, toolMessage);
  }

  // Get current conversation history for the final response
  const currentHistory = await getConversationHistory(conversationId);

  // Must bind tools when processing tool results
  if (!chatModel.bindTools) {
    throw new Error('Chat model does not support tool binding');
  }
  const modelWithTools = chatModel.bindTools(tools);

  onProgress?.({
    type: 'ai_processing',
    data: 'Processing with AI...',
  });
  const finalResponse = await modelWithTools.invoke(currentHistory);

  await addToConversationHistory(conversationId, finalResponse);

  // Check if conversation should be summarized
  const tokenUsage = getTokenUsage(finalResponse);
  if (shouldSummarize(tokenUsage)) {
    const updatedHistory = await getConversationHistory(conversationId);
    const summarizedHistory = await summarizeConversationHistory(
      updatedHistory,
      chatModel
    );
    const serializedHistory =
      mapChatMessagesToStoredMessages(summarizedHistory);
    await conversationStore.set(conversationId, serializedHistory);
  }

  updateTokenUsage(finalResponse, onProgress);

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
  chatModel: BaseChatModel
): Promise<string> {
  const { conversationId } = request;

  if (!conversationId) {
    throw new Error('conversationId is required');
  }

  // Setup tools
  const allTools = await setupTools(request);

  // Get conversation history
  const history = await getConversationHistory(conversationId);

  // Add system message at the beginning if this is a new conversation
  if (history.length === 0) {
    await addToConversationHistory(
      conversationId,
      createSystemMessage(
        allTools,
        request.azureName,
        request.slackUserId,
        request.timezone
      )
    );
  }

  // Add user message to history
  const userMessage = new HumanMessage(request.input);
  await addToConversationHistory(conversationId, userMessage);

  request.onProgress?.({ type: 'status', data: 'Starting new query...' });

  // Bind tools to the model
  if (!chatModel.bindTools) {
    throw new Error('Chat model does not support tool binding');
  }
  const modelWithTools = chatModel.bindTools(allTools);

  // Get the response (which might include tool calls)
  const currentHistory = await getConversationHistory(conversationId);

  request.onProgress?.({
    type: 'ai_processing',
    data: 'Processing with AI...',
  });
  const response = await modelWithTools.invoke(currentHistory);

  await addToConversationHistory(conversationId, response);

  // Handle the response which may contain tool calls
  const finalAIMessage = await processResponseWithTools(
    response,
    allTools,
    conversationId,
    chatModel,
    request.onProgress
  );

  // Add final AI response to history
  await addToConversationHistory(conversationId, finalAIMessage);

  // Extract and send token usage via progress callback
  updateTokenUsage(finalAIMessage, request.onProgress);

  return extractContentAsString(finalAIMessage);
}
