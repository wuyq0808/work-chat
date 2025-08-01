/**
 * Quick test script for GitHub code search tool
 * Tests the GitHub tools layer with code search functionality
 */

import { getTokens } from './get-tokens.js';
import { GitHubAPIClient } from '../src/mcp-tools/github/github-client.js';
import { GitHubTools } from '../src/mcp-tools/github/github-tools.js';

async function testGitHubCodeSearchTool() {
  try {
    console.log('🧪 Testing GitHub Code Search Tool...');
    
    const tokens = getTokens();
    
    if (!tokens.github_token) {
      console.error('❌ No GitHub token found in COOKIES environment variable');
      console.log('💡 Make sure to set COOKIES with github_token=your_token_here');
      process.exit(1);
    }

    console.log('✅ Found GitHub token, initializing GitHub tools...');

    // Initialize GitHub client and tools
    const githubClient = new GitHubAPIClient({
      accessToken: tokens.github_token,
    });

    const githubTools = new GitHubTools(githubClient);
    const tools = githubTools.getTools();

    console.log(`📦 Loaded ${tools.length} GitHub tools`);

    // Find the unified search tool
    const searchTool = tools.find(tool => tool.name === 'github__search');
    
    if (!searchTool) {
      console.error('❌ GitHub search tool not found!');
      process.exit(1);
    }

    console.log('✅ Found github__search tool');

    // Test 1: Search for TypeScript React hooks (code search)
    console.log('\n🔍 Test 1: Searching for TypeScript React hooks...');
    const result1 = await searchTool.invoke({
      query: 'useState language:typescript',
      maxResults: 5
    });

    console.log('📄 Result:');
    console.log(result1);

    // Test 2: Search for console.log in JavaScript (auto-detect code)
    console.log('\n🔍 Test 2: Searching for console.log in JavaScript...');
    const result2 = await searchTool.invoke({
      query: 'console.log language:javascript',
      maxResults: 3,
    });

    console.log('📄 Result:');
    console.log(result2);

    // Test 3: Search private repositories only (default)
    console.log('\n🔍 Test 3: Searching private repositories only...');
    const result3 = await searchTool.invoke({
      query: 'useState',
      maxResults: 3,
    });

    console.log('📄 Result:');
    console.log(result3);

    // Test 4: Search with different query
    console.log('\n🔍 Test 4: Searching for React components...');
    const result4 = await searchTool.invoke({
      query: 'React.Component',
      maxResults: 3
    });

    console.log('📄 Result:');
    console.log(result4);

    console.log('\n✅ All GitHub unified search tool tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
    process.exit(1);
  }
}

testGitHubCodeSearchTool();