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

async function testAzureEmailSearch() {
  console.log('🧪 Testing Azure Email Search Tool');
  console.log('===================================\n');

  // Check if Azure token is available
  const azureToken = process.env.AZURE_TOKEN;
  if (!azureToken) {
    console.error('❌ AZURE_TOKEN not found in environment variables');
    console.log('💡 Please set AZURE_TOKEN in your .env file');
    process.exit(1);
  }

  try {
    // Initialize Azure client and tools
    const azureClient = new AzureAPIClient(azureToken);
    const azureTools = new AzureTools(azureClient, 'America/New_York');
    
    const tools = azureTools.getTools();
    const emailContentTool = tools.find(tool => tool.name === 'azure__get_email_content');
    
    if (!emailContentTool) {
      console.error('❌ azure__get_email_content tool not found');
      process.exit(1);
    }

    console.log('✅ Found azure__get_email_content tool');
    console.log(`📝 Description: ${emailContentTool.description}\n`);

    // Test cases with different keywords
    const testKeywords = [
      'meeting',
      'project',
      'budget', 
      'deadline',
      'review'
    ];

    for (const keyword of testKeywords) {
      console.log(`🔍 Testing keyword search: "${keyword}"`);
      console.log('─'.repeat(50));
      
      try {
        const result = await emailContentTool.invoke({ keyword });
        
        if (result) {
          const lines = result.split('\n');
          const headerLine = lines[0];
          const dataLines = lines.slice(1).filter(line => line.trim());
          
          console.log(`📊 Found ${dataLines.length} emails matching "${keyword}"`);
          console.log(`📋 Headers: ${headerLine}`);
          
          if (dataLines.length > 0) {
            console.log(`📄 Sample result (first email):`);
            const firstEmail = dataLines[0].split(',');
            console.log(`   Subject: ${firstEmail[1]?.replace(/"/g, '')}`);
            console.log(`   From: ${firstEmail[2]}`);
            console.log(`   Date: ${firstEmail[4]}`);
            console.log(`   Body preview: ${firstEmail[7]?.substring(0, 100).replace(/"/g, '')}...`);
          } else {
            console.log(`   No emails found for keyword "${keyword}"`);
          }
        } else {
          console.log(`❌ No result returned for keyword "${keyword}"`);
        }
        
      } catch (error) {
        console.error(`❌ Error testing keyword "${keyword}":`, error);
      }
      
      console.log(''); // Empty line between tests
    }

    // Test with empty keyword
    console.log('🔍 Testing with empty keyword');
    console.log('─'.repeat(50));
    
    try {
      const result = await emailContentTool.invoke({ keyword: '' });
      console.log('📊 Empty keyword result:', result ? 'Success' : 'No result');
    } catch (error) {
      console.error('❌ Error with empty keyword:', error);
    }

    console.log('\n✅ Azure email search testing completed!');
    console.log('\n📝 Tool Summary:');
    console.log('   - Tool now accepts "keyword" parameter instead of "messageId"');
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