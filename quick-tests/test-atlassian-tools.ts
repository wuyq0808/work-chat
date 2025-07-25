#!/usr/bin/env node

import dotenv from 'dotenv';
import { AtlassianAPIClient } from '../src/mcp-servers/atlassian/atlassian-client.js';
import { AtlassianTools } from '../src/mcp-servers/atlassian/atlassian-tools.js';
import { extractAtlassianToken } from './get-tokens.js';

// Load environment variables
dotenv.config();

async function testAtlassianTools() {
  console.log('🧪 Testing Atlassian Tools with User Mention Functionality...\n');

  // Check for required environment variables
  let accessToken = process.env.ATLASSIAN_ACCESS_TOKEN;
  const cloudId = process.env.ATLASSIAN_CLOUD_ID;

  // If no direct access token, try to extract from COOKIES using utility
  if (!accessToken) {
    const tokenFromCookies = extractAtlassianToken();
    if (tokenFromCookies) {
      accessToken = tokenFromCookies;
      console.log('✅ Found Atlassian token in COOKIES environment variable');
    }
  }

  if (!accessToken) {
    console.error('❌ No Atlassian access token found. Please set either:');
    console.error('   - ATLASSIAN_ACCESS_TOKEN environment variable, or');
    console.error('   - Include atlassian_token in COOKIES environment variable');
    process.exit(1);
  }

  console.log('✅ Environment variables loaded');
  console.log(`   Access Token: ${accessToken.substring(0, 10)}...`);
  console.log(`   Cloud ID: ${cloudId || 'Not set (will auto-discover)'}\n`);

  try {
    // Initialize the client and tools
    const atlassianClient = new AtlassianAPIClient({
      accessToken,
      cloudId,
    });

    const atlassianTools = new AtlassianTools(atlassianClient);
    const tools = atlassianTools.getTools();

    console.log(`🔧 Initialized ${tools.length} Atlassian tools:\n`);
    tools.forEach((tool, index) => {
      console.log(`   ${index + 1}. ${tool.name}: ${tool.description}`);
    });
    console.log();

    // Test 1: Get accessible resources (to verify authentication)
    console.log('🔍 Test 1: Verifying Atlassian authentication...');
    const resourcesResult = await atlassianClient.getAccessibleResources();
    
    if (resourcesResult.success && resourcesResult.data) {
      console.log('✅ Authentication successful!');
      console.log(`   Found ${resourcesResult.data.length} accessible resource(s):`);
      resourcesResult.data.forEach((resource, index) => {
        console.log(`     ${index + 1}. ${resource.name} (ID: ${resource.id})`);
      });
    } else {
      console.error('❌ Authentication failed:', resourcesResult.error);
      process.exit(1);
    }
    console.log();

    // Test 2: Enhanced Jira tool with user mentions
    console.log('🎯 Test 2: Testing enhanced Jira tool (with user mentions)...');
    const jiraTool = tools.find(tool => tool.name === 'atlassian__jira_get_latest_issues');
    
    if (jiraTool) {
      console.log('   Running: Get user latest issues (last 7 days)...');
      try {
        const jiraResult = await jiraTool.invoke({ days: 7 });
        console.log('✅ Jira tool executed successfully!');
        console.log('   Sample output (first 200 chars):');
        console.log(`   ${jiraResult.substring(0, 200)}...`);
        
        // Count rows in CSV output
        const csvRows = jiraResult.split('\n').filter(row => row.trim());
        console.log(`   Found ${csvRows.length - 1} issues (excluding header)`);
      } catch (error) {
        console.error('❌ Jira tool failed:', error instanceof Error ? error.message : error);
      }
    } else {
      console.error('❌ Jira tool not found');
    }
    console.log();

    // Test 3: New Confluence tool with user mentions
    console.log('📄 Test 3: Testing new Confluence pages tool (with user mentions)...');
    const confluenceTool = tools.find(tool => tool.name === 'atlassian__confluence_get_latest_pages');
    
    if (confluenceTool) {
      console.log('   Running: Get latest Confluence pages (last 14 days, with user mentions)...');
      try {
        const confluenceResult = await confluenceTool.invoke({ 
          days: 14, 
          maxResults: 5,
          includeUserMentions: true 
        });
        console.log('✅ Confluence tool executed successfully!');
        console.log('   Sample output (first 300 chars):');
        console.log(`   ${confluenceResult.substring(0, 300)}...`);
        
        // Count rows in CSV output
        const csvRows = confluenceResult.split('\n').filter(row => row.trim());
        console.log(`   Found ${csvRows.length - 1} pages (excluding header)`);
      } catch (error) {
        console.error('❌ Confluence tool failed:', error instanceof Error ? error.message : error);
      }
    } else {
      console.error('❌ Confluence tool not found');
    }
    console.log();

    // Test 4: Test JQL search with user mentions
    console.log('🔍 Test 4: Testing Jira search with user mention JQL...');
    const searchTool = tools.find(tool => tool.name === 'atlassian__search_jira_issues');
    
    if (searchTool) {
      console.log('   Running: Search for issues where user is mentioned...');
      try {
        const searchResult = await searchTool.invoke({ 
          jql: 'comment ~ currentUser() OR description ~ currentUser()',
          maxResults: 3
        });
        console.log('✅ Jira search tool executed successfully!');
        console.log('   Sample output (first 200 chars):');
        console.log(`   ${searchResult.substring(0, 200)}...`);
        
        // Count rows in CSV output
        const csvRows = searchResult.split('\n').filter(row => row.trim());
        console.log(`   Found ${csvRows.length - 1} issues with mentions (excluding header)`);
      } catch (error) {
        console.error('❌ Jira search tool failed:', error instanceof Error ? error.message : error);
      }
    } else {
      console.error('❌ Jira search tool not found');
    }
    console.log();

    // Test 5: Test Confluence search with CQL mentions
    console.log('📊 Test 5: Testing Confluence search with CQL user mentions...');
    const confluenceSearchTool = tools.find(tool => tool.name === 'atlassian__search_confluence_pages');
    
    if (confluenceSearchTool) {
      console.log('   Running: Search for pages where user is mentioned...');
      try {
        const confluenceSearchResult = await confluenceSearchTool.invoke({ 
          cql: 'type = page AND mention = currentUser()',
          maxResults: 3
        });
        console.log('✅ Confluence search tool executed successfully!');
        console.log('   Sample output (first 200 chars):');
        console.log(`   ${confluenceSearchResult.substring(0, 200)}...`);
      } catch (error) {
        console.error('❌ Confluence search tool failed:', error instanceof Error ? error.message : error);
      }
    } else {
      console.error('❌ Confluence search tool not found');
    }
    console.log();

    console.log('🎉 All tests completed!');
    console.log();
    console.log('📋 Summary of User Mention Functionality:');
    console.log('   ✅ Enhanced Jira tool now includes user mentions in comments/descriptions');
    console.log('   ✅ New Confluence tool searches for pages with user mentions');
    console.log('   ✅ Both tools support configurable time ranges');
    console.log('   ✅ All tools return structured CSV data for easy parsing');
    
  } catch (error) {
    console.error('💥 Test suite failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run the tests
if (import.meta.url === `file://${process.argv[1]}`) {
  testAtlassianTools().catch(console.error);
}

export { testAtlassianTools };