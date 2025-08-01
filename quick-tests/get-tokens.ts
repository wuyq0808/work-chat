/**
 * Utility functions for extracting authentication tokens from COOKIES environment variable
 * Used by adhoc test scripts to get tokens for API testing
 */

import 'dotenv/config';

export interface ExtractedTokens {
  azureToken?: string;
  slackToken?: string;
  atlassianToken?: string;
  githubToken?: string;
}

/**
 * Extract Azure token from COOKIES environment variable
 */
export function extractAzureToken(): string | null {
  const cookies = process.env.COOKIES;
  if (!cookies) {
    return null;
  }

  const azureTokenMatch = cookies.match(/azure_token=([^;]+)/);
  return azureTokenMatch ? azureTokenMatch[1] : null;
}

/**
 * Extract Slack token from COOKIES environment variable
 */
export function extractSlackToken(): string | null {
  const cookies = process.env.COOKIES;
  if (!cookies) {
    return null;
  }

  const slackTokenMatch = cookies.match(/slack_token=([^;]+)/);
  return slackTokenMatch ? slackTokenMatch[1] : null;
}

/**
 * Extract Atlassian token from COOKIES environment variable
 */
export function extractAtlassianToken(): string | null {
  const cookies = process.env.COOKIES;
  if (!cookies) {
    return null;
  }

  const atlassianTokenMatch = cookies.match(/atlassian_token=([^;]+)/);
  return atlassianTokenMatch ? atlassianTokenMatch[1] : null;
}

/**
 * Extract GitHub token from COOKIES environment variable
 */
export function extractGitHubToken(): string | null {
  const cookies = process.env.COOKIES;
  if (!cookies) {
    return null;
  }

  const githubTokenMatch = cookies.match(/github_token=([^;]+)/);
  return githubTokenMatch ? githubTokenMatch[1] : null;
}

/**
 * Extract all available tokens from COOKIES environment variable
 */
export function extractAllTokens(): ExtractedTokens {
  return {
    azureToken: extractAzureToken() || undefined,
    slackToken: extractSlackToken() || undefined,
    atlassianToken: extractAtlassianToken() || undefined,
    githubToken: extractGitHubToken() || undefined,
  };
}

/**
 * Check if COOKIES environment variable exists and throw error with helpful message if not
 */
export function validateCookiesEnv(): void {
  if (!process.env.COOKIES) {
    console.error('❌ No COOKIES found in environment');
    console.log('💡 Please set COOKIES in your .env file');
    console.log('   Format: COOKIES="azure_token=xxx; slack_token=yyy; atlassian_token=zzz"');
    process.exit(1);
  }
}

/**
 * Extract and validate Azure token, exit with error if not found
 */
export function requireAzureToken(): string {
  validateCookiesEnv();
  
  const azureToken = extractAzureToken();
  if (!azureToken) {
    console.error('❌ No azure_token found in COOKIES');
    console.log('💡 Please ensure azure_token is present in COOKIES');
    console.log('   Expected format: COOKIES="azure_token=your_token_here; ..."');
    process.exit(1);
  }
  
  return azureToken;
}

/**
 * Extract and validate Slack token, exit with error if not found
 */
export function requireSlackToken(): string {
  validateCookiesEnv();
  
  const slackToken = extractSlackToken();
  if (!slackToken) {
    console.error('❌ No slack_token found in COOKIES');
    console.log('💡 Please ensure slack_token is present in COOKIES');
    console.log('   Expected format: COOKIES="slack_token=your_token_here; ..."');
    process.exit(1);
  }
  
  return slackToken;
}

/**
 * Extract and validate Atlassian token, exit with error if not found
 */
export function requireAtlassianToken(): string {
  validateCookiesEnv();
  
  const atlassianToken = extractAtlassianToken();
  if (!atlassianToken) {
    console.error('❌ No atlassian_token found in COOKIES');
    console.log('💡 Please ensure atlassian_token is present in COOKIES');
    console.log('   Expected format: COOKIES="atlassian_token=your_token_here; ..."');
    process.exit(1);
  }
  
  return atlassianToken;
}

/**
 * Extract and validate GitHub token, exit with error if not found
 */
export function requireGitHubToken(): string {
  validateCookiesEnv();
  
  const githubToken = extractGitHubToken();
  if (!githubToken) {
    console.error('❌ No github_token found in COOKIES');
    console.log('💡 Please ensure github_token is present in COOKIES');
    console.log('   Expected format: COOKIES="github_token=your_token_here; ..."');
    process.exit(1);
  }
  
  return githubToken;
}

/**
 * Helper function to display available tokens (for debugging)
 */
export function showAvailableTokens(): void {
  const tokens = extractAllTokens();
  console.log('🔑 Available tokens in COOKIES:');
  console.log(`   Azure: ${tokens.azureToken ? '✅ Found' : '❌ Missing'}`);
  console.log(`   Slack: ${tokens.slackToken ? '✅ Found' : '❌ Missing'}`);
  console.log(`   Atlassian: ${tokens.atlassianToken ? '✅ Found' : '❌ Missing'}`);
  console.log(`   GitHub: ${tokens.githubToken ? '✅ Found' : '❌ Missing'}`);
}

/**
 * Simple interface for accessing all tokens (backward compatibility)
 */
export function getTokens() {
  const tokens = extractAllTokens();
  return {
    azure_token: tokens.azureToken,
    slack_token: tokens.slackToken,
    atlassian_token: tokens.atlassianToken,
    github_token: tokens.githubToken,
  };
}