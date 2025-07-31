import { ChatBedrockConverse } from '@langchain/aws';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AWSConfig } from '../../utils/secrets-manager.js';

// Create a Claude Bedrock model
export function claudeBedrock(
  version: '35' | '37',
  awsConfig: AWSConfig
): BaseChatModel {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const modelId =
    version === '35'
      ? awsConfig.AWS_BEDROCK_CLAUDE_35_MODEL_ID
      : awsConfig.AWS_BEDROCK_CLAUDE_37_MODEL_ID;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      'AWS credentials not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.'
    );
  }

  if (!modelId) {
    throw new Error(
      `AWS_BEDROCK_CLAUDE_${version}_MODEL_ID not found in configuration.`
    );
  }

  return new ChatBedrockConverse({
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
