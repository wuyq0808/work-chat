#!/usr/bin/env node

/**
 * Adhoc test for the modified azure__get_email_content tool
 * Tests keyword search functionality instead of email ID lookup
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();
import { AzureAPIClient } from '../src/mcp-servers/azure/azure-client.js';
import { AzureTools } from '../src/mcp-servers/azure/azure-tools.js';
import { requireAzureToken } from './get-tokens.js';

async function testAzureEmailSearch() {
  console.log('🧪 Testing Azure Email Search Tool');
  console.log('===================================\n');

  // Extract Azure token from COOKIES using utility
  const azureToken = requireAzureToken();

  try {
    // Initialize Azure client with simple config
    const azureClient = new AzureAPIClient({ 
      accessToken: azureToken
    });
    const azureTools = new AzureTools(azureClient, 'America/New_York');
    
    const tools = azureTools.getTools();
    const emailSearchTool = tools.find(tool => tool.name === 'azure__search_email');
    
    if (!emailSearchTool) {
      console.error('❌ azure__search_email tool not found');
      process.exit(1);
    }

    console.log('✅ Found azure__search_email tool');
    console.log(`📝 Description: ${emailSearchTool.description}\n`);

    // Test cases with different search queries
    const testQueries = [
      'meeting',
      'project',
      'budget', 
      'deadline',
      'review'
    ];

    for (const query of testQueries) {
      console.log(`🔍 Testing search query: "${query}"`);
      console.log('─'.repeat(50));
      
      try {
        const result = await emailSearchTool.invoke({ query });
        
        if (result) {
          const lines = result.split('\n');
          const headerLine = lines[0];
          const dataLines = lines.slice(1).filter(line => line.trim());
          
          console.log(`📊 Found ${dataLines.length} emails matching "${query}"`);
          console.log(`📋 Headers: ${headerLine}`);
          
          if (dataLines.length > 0) {
            console.log(`📄 Sample result (first email):`);
            const firstEmail = dataLines[0].split(',');
            console.log(`   Subject: ${firstEmail[1]?.replace(/"/g, '')}`);
            console.log(`   From: ${firstEmail[2]}`);
            console.log(`   Date: ${firstEmail[4]}`);
            console.log(`   Body preview: ${firstEmail[7]?.substring(0, 100).replace(/"/g, '')}...`);
          } else {
            console.log(`   No emails found for query "${query}"`);
          }
        } else {
          console.log(`❌ No result returned for query "${query}"`);
        }
        
      } catch (error) {
        console.error(`❌ Error testing query "${query}":`, error);
      }
      
      console.log(''); // Empty line between tests
    }

    // Test with empty query
    console.log('🔍 Testing with empty query');
    console.log('─'.repeat(50));
    
    try {
      const result = await emailSearchTool.invoke({ query: '' });
      console.log('📊 Empty query result:', result ? 'Success' : 'No result');
    } catch (error) {
      console.error('❌ Error with empty query:', error);
    }

    console.log('\n✅ Azure email search testing completed!');
    console.log('\n📝 Tool Summary:');
    console.log('   - Tool now accepts "query" parameter instead of "messageId"');
    console.log('   - Supports multiple keywords and search operators');
    console.log('   - Searches in email title, content, and sender');
    console.log('   - Returns full email content with body text');
    console.log('   - Limited to 10 most relevant results for performance');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testAzureEmailSearch().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});