import { ChatBedrockConverse } from '@langchain/aws';
import type { AIRequest } from '../services/llmService.js';
import { withRetry, isBedrockThrottlingError } from '../utils/retry-utils.js';
import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConversationRole,
} from '@aws-sdk/client-bedrock-runtime';
import { AWSConfig } from '../utils/secrets-manager.js';

// Create a wrapper that implements retry logic for Claude Bedrock using modern LangChain AWS integration
export class RetryableClaudeBedrockChat {
  private bedrock: ChatBedrockConverse;
  private version: '35' | '37';
  private awsConfig: AWSConfig;

  constructor(version: '35' | '37', awsConfig: AWSConfig) {
    this.version = version;
    this.awsConfig = awsConfig;

    // Check if AWS credentials are provided
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const modelId =
      this.version === '35'
        ? awsConfig.AWS_BEDROCK_CLAUDE_35_MODEL_ID
        : awsConfig.AWS_BEDROCK_CLAUDE_37_MODEL_ID;

    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        'AWS credentials not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.'
      );
    }

    if (!modelId) {
      throw new Error(
        `AWS_BEDROCK_CLAUDE_${this.version}_MODEL_ID not found in configuration.`
      );
    }

    this.bedrock = new ChatBedrockConverse({
      model: modelId,
      region: awsConfig.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId,
        secretAccessKey,
        sessionToken: process.env.AWS_SESSION_TOKEN,
      },
      temperature: 0.7,
      maxTokens: 8192,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- LangChain message and response types are complex
  async invoke(messages: any[]): Promise<any> {
    return withRetry(
      async () => {
        const result = await this.bedrock.invoke(messages);
        return result;
      },
      { retries: 3, factor: 2, minTimeout: 1000, maxTimeout: 5000 },
      isBedrockThrottlingError
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- LangChain tool types are complex
  bindTools(tools: any[]): RetryableClaudeBedrockChat {
    const boundBedrock = this.bedrock.bindTools(tools);
    const wrapper = new RetryableClaudeBedrockChat(
      this.version,
      this.awsConfig
    );
    wrapper.bedrock = boundBedrock as ChatBedrockConverse;
    return wrapper;
  }
}

export async function callClaudeBedrock(
  request: AIRequest,
  version: '35' | '37',
  awsConfig: AWSConfig
): Promise<string> {
  const modelId =
    version === '35'
      ? awsConfig.AWS_BEDROCK_CLAUDE_35_MODEL_ID
      : awsConfig.AWS_BEDROCK_CLAUDE_37_MODEL_ID;

  if (!modelId) {
    throw new Error(
      `AWS_BEDROCK_CLAUDE_${version}_MODEL_ID not found in configuration`
    );
  }

  const bedrockClient = new BedrockRuntimeClient({
    region: awsConfig.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      sessionToken: process.env.AWS_SESSION_TOKEN,
    },
  });

  const conversation = {
    modelId,
    messages: [
      {
        role: ConversationRole.USER,
        content: [{ text: request.input }],
      },
    ],
    inferenceConfig: {
      maxTokens: 8192,
      temperature: 0.7,
    },
  };

  const response = await bedrockClient.send(new ConverseCommand(conversation));

  let output = '';
  if (response.output?.message?.content) {
    for (const content of response.output.message.content) {
      if (content.text) {
        output += content.text;
      }
    }
  }

  return output || 'No response generated';
}
