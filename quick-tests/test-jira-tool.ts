#!/usr/bin/env tsx
import 'dotenv/config';
import { AtlassianAPIClient } from '../src/mcp-servers/atlassian/atlassian-client.js';
import { AtlassianTools } from '../src/mcp-servers/atlassian/atlassian-tools.js';
import { requireAtlassianToken } from './get-tokens.js';

async function testJiraTool() {
  console.log('🔧 Testing Jira Tool...\n');

  try {
    // Extract the Atlassian token from COOKIES using utility
    const accessToken = requireAtlassianToken();
    console.log('✅ Found Atlassian token in environment');

    // Create Atlassian client and tools
    const atlassianClient = new AtlassianAPIClient({
      accessToken: accessToken
    });

    const atlassianTools = new AtlassianTools(atlassianClient);
    const tools = atlassianTools.getTools();

    // Find both tools
    const getUserLatestIssuesTool = tools.find(
      tool => tool.name === 'atlassian__get_user_latest_issues'
    );
    
    const searchJiraIssuesTool = tools.find(
      tool => tool.name === 'atlassian__search_jira_issues'
    );

    if (!getUserLatestIssuesTool) {
      throw new Error('atlassian__get_user_latest_issues tool not found');
    }
    
    if (!searchJiraIssuesTool) {
      throw new Error('atlassian__search_jira_issues tool not found');
    }

    console.log('✅ Found both Jira tools');

    // Test the tool with 30 days to get more issues
    console.log('\n📋 Testing with 30 days to see epic fields...');
    const result = await getUserLatestIssuesTool.invoke({ days: 30 });
    
    // Parse CSV and show first 10 issues with their epic information
    const lines = result.split('\n');
    const header = lines[0];
    console.log('\nHeader:', header);
    console.log('\nFirst 10 issues:');
    
    for (let i = 1; i <= Math.min(10, lines.length - 1); i++) {
      if (lines[i].trim()) {
        const columns = lines[i].split(',');
        const key = columns[0];
        const summary = columns[1]?.replace(/"/g, '') || '';
        const status = columns[2]?.replace(/"/g, '') || '';
        const epicKey = columns[8]?.replace(/"/g, '') || '';
        const epicSummary = columns[9]?.replace(/"/g, '') || '';
        
        console.log(`${i}. ${key}: ${summary.substring(0, 50)}...`);
        console.log(`   Status: ${status}`);
        if (epicKey) {
          console.log(`   Epic: ${epicKey} - ${epicSummary.substring(0, 40)}...`);
        } else {
          console.log(`   Epic: None`);
        }
        console.log('');
      }
    }

    // Test the search tool with detailed content
    console.log('\n🔍 Testing atlassian__search_jira_issues with detailed content...');
    const searchResult = await searchJiraIssuesTool.invoke({ 
      jql: 'assignee = currentUser() ORDER BY updated DESC',
      maxResults: 3
    });
    
    // Parse and show detailed content
    const searchLines = searchResult.split('\n');
    const searchHeader = searchLines[0];
    console.log('\nSearch Header:', searchHeader);
    console.log('\nFirst 3 issues with descriptions:');
    
    for (let i = 1; i <= Math.min(3, searchLines.length - 1); i++) {
      if (searchLines[i].trim()) {
        // Parse CSV more carefully for descriptions
        const csvParts = [];
        let current = '';
        let inQuotes = false;
        
        for (let j = 0; j < searchLines[i].length; j++) {
          const char = searchLines[i][j];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            csvParts.push(current);
            current = '';
            continue;
          }
          current += char;
        }
        csvParts.push(current);
        
        const key = csvParts[0] || '';
        const summary = (csvParts[1] || '').replace(/"/g, '');
        const description = (csvParts[2] || '').replace(/"/g, '');
        
        console.log(`${i}. ${key}: ${summary.substring(0, 40)}...`);
        if (description) {
          console.log(`   Description: ${description.substring(0, 100)}...`);
        } else {
          console.log(`   Description: (empty)`);
        }
        console.log('');
      }
    }

    console.log('\n✅ All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testJiraTool();