/**
 * Quick test script for GitHub file content and repository tree tools
 * Tests the new file and folder structure functionality
 */

import { getTokens } from './get-tokens.js';
import { GitHubAPIClient } from '../src/mcp-tools/github/github-client.js';
import { GitHubTools } from '../src/mcp-tools/github/github-tools.js';

async function testGitHubFileAndTreeTools() {
  try {
    console.log('🧪 Testing GitHub File Content and Repository Tree Tools...');
    
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

    // Find the new tools
    const fileContentTool = tools.find(tool => tool.name === 'github__get_file_content');
    const repositoryTreeTool = tools.find(tool => tool.name === 'github__get_repository_tree');
    
    if (!fileContentTool) {
      console.error('❌ File content tool not found!');
      process.exit(1);
    }
    
    if (!repositoryTreeTool) {
      console.error('❌ Repository tree tool not found!');
      process.exit(1);
    }

    console.log('✅ Found github__get_file_content and github__get_repository_tree tools');

    // Test 1: Get repository tree structure (top level)
    console.log('\n🔍 Test 1: Getting top-level repository tree...');
    const result1 = await repositoryTreeTool.invoke({
      owner: 'microsoft',
      repo: 'vscode'
    });

    console.log('📄 Result (first 500 chars):');
    console.log(result1.substring(0, 500) + '...');

    // Test 2: Get a specific file content  
    console.log('\n🔍 Test 2: Getting specific file content...');
    const result2 = await fileContentTool.invoke({
      owner: 'microsoft',
      repo: 'vscode',
      path: 'package.json'
    });

    console.log('📄 Result (first 500 chars):');
    console.log(result2.substring(0, 500) + '...');

    // Test 3: Get recursive tree structure (smaller repo)
    console.log('\n🔍 Test 3: Getting recursive tree structure...');
    const result3 = await repositoryTreeTool.invoke({
      owner: 'octocat',
      repo: 'Hello-World',
      recursive: true
    });

    console.log('📄 Result:');
    console.log(result3);

    console.log('\n✅ All GitHub file and tree tool tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
    process.exit(1);
  }
}

testGitHubFileAndTreeTools();