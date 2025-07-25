#!/usr/bin/env node

import dotenv from 'dotenv';
import { AtlassianAPIClient } from '../src/mcp-servers/atlassian/atlassian-client.js';
import { AtlassianTools } from '../src/mcp-servers/atlassian/atlassian-tools.js';
import { extractAtlassianToken } from './get-tokens.js';

// Load environment variables
dotenv.config();

async function testConfluencePages() {
  console.log('📄 Testing Confluence Pages Tool...\n');

  // Extract token from COOKIES using utility
  let accessToken = process.env.ATLASSIAN_ACCESS_TOKEN;
  if (!accessToken) {
    const tokenFromCookies = extractAtlassianToken();
    if (tokenFromCookies) {
      accessToken = tokenFromCookies;
      console.log('✅ Found Atlassian token in COOKIES');
    }
  }

  if (!accessToken) {
    console.error('❌ No Atlassian access token found');
    process.exit(1);
  }

  try {
    // Initialize client and tools
    const atlassianClient = new AtlassianAPIClient({ accessToken });
    const atlassianTools = new AtlassianTools(atlassianClient);
    const tools = atlassianTools.getTools();

    // Find the confluence pages tool
    const confluenceTool = tools.find(tool => 
      tool.name === 'atlassian__confluence_get_latest_pages'
    );

    if (!confluenceTool) {
      console.error('❌ Confluence pages tool not found');
      process.exit(1);
    }

    console.log('🔧 Found tool:', confluenceTool.name);
    console.log('📝 Description:', confluenceTool.description);
    console.log();

    // Test different configurations
    const testConfigs = [
      { 
        name: 'Last 7 days with user mentions', 
        params: { days: 7, maxResults: 5, includeUserMentions: true } 
      },
      { 
        name: 'Last 30 days without user mentions', 
        params: { days: 30, maxResults: 10, includeUserMentions: false } 
      },
      { 
        name: 'Default settings', 
        params: {} 
      }
    ];

    for (const config of testConfigs) {
      console.log(`🧪 Testing: ${config.name}`);
      console.log(`   Parameters:`, JSON.stringify(config.params, null, 2));
      
      try {
        const result = await confluenceTool.invoke(config.params);
        
        // Parse CSV to show structured data
        const lines = result.split('\n').filter(line => line.trim());
        const headers = lines[0];
        const dataRows = lines.slice(1);
        
        console.log(`✅ Success! Found ${dataRows.length} pages`);
        console.log('📊 CSV Headers:', headers);
        console.log();
        
        if (dataRows.length > 0) {
          console.log('📋 Sample Results:');
          dataRows.slice(0, 3).forEach((row, index) => {
            console.log(`   ${index + 1}. ${row}`);
          });
          console.log();
          
          // Show detailed breakdown of first result
          if (dataRows.length > 0) {
            const firstRow = dataRows[0].split(',');
            const headerArray = headers.split(',');
            
            console.log('🔍 Detailed breakdown of first result:');
            headerArray.forEach((header, index) => {
              const value = firstRow[index] || 'N/A';
              console.log(`   ${header}: ${value}`);
            });
            console.log();
          }
        } else {
          console.log('   No pages found for this configuration');
        }
        
      } catch (error) {
        console.error(`❌ Failed:`, error instanceof Error ? error.message : error);
      }
      
      console.log('---'.repeat(20));
      console.log();
    }

    console.log('🎉 Confluence pages tool testing completed!');
    
  } catch (error) {
    console.error('💥 Test failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  testConfluencePages().catch(console.error);
}

export { testConfluencePages };