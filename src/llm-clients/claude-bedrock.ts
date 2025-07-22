import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConversationRole,
} from '@aws-sdk/client-bedrock-runtime';
import type { AIRequest } from '../services/llmService.js';

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'eu-west-1',
});

export async function callClaudeBedrock(request: AIRequest): Promise<string> {
  try {
    // Note: AWS Bedrock doesn't support MCP servers like Anthropic's direct API
    // If MCP functionality is needed, consider using the direct Anthropic API instead

    if (!process.env.AWS_BEDROCK_CLAUDE_MODEL_ID) {
      throw new Error(
        'AWS_BEDROCK_CLAUDE_MODEL_ID environment variable is required'
      );
    }

    const conversation = {
      modelId: process.env.AWS_BEDROCK_CLAUDE_MODEL_ID,
      messages: [
        {
          role: ConversationRole.USER,
          content: [
            {
              text: request.input,
            },
          ],
        },
      ],
      inferenceConfig: {
        maxTokens: 8192,
        temperature: 0.7,
      },
    };

    // Add reasoning configuration if supported
    const reasoningConfig = {
      reasoning: {
        thinking: {
          type: 'enabled',
          budget_tokens: 4096,
        },
      },
    };

    // Try with reasoning first, fall back to basic if not supported
    let response;
    try {
      const command = new ConverseCommand({
        ...conversation,
        ...reasoningConfig,
      });
      response = await bedrockClient.send(command);
    } catch {
      // If reasoning fails, try without it
      const command = new ConverseCommand(conversation);
      response = await bedrockClient.send(command);
    }

    // Extract content from response
    let output = '';
    if (response.output?.message?.content) {
      for (const content of response.output.message.content) {
        if (content.text) {
          output += content.text;
        }
        // Note: Reasoning/thinking content is available in content.thinking if present
      }
    }

    return output || 'No response generated';
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AccessDeniedException') {
        return 'Error: Access denied to Claude model on AWS Bedrock. Please check your AWS permissions and model access.';
      }
      if (error.name === 'ValidationException') {
        return 'Error: Invalid request to AWS Bedrock. Please check the model ID and parameters.';
      }
      return `Error: ${error.message}`;
    }
    return 'Error: Failed to generate response from AWS Bedrock';
  }
}
