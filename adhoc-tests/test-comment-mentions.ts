#!/usr/bin/env node

import dotenv from 'dotenv';
import { AtlassianAPIClient } from '../src/mcp-servers/atlassian/atlassian-client.js';

dotenv.config();

async function testCommentMentions() {
  console.log('💬 Testing Comment-Specific Mention Detection...\n');

  let accessToken = process.env.ATLASSIAN_ACCESS_TOKEN;
  if (!accessToken) {
    const cookies = process.env.COOKIES;
    if (cookies) {
      const tokenMatch = cookies.match(/atlassian_token=([^;]+)/);
      if (tokenMatch) accessToken = tokenMatch[1];
    }
  }

  try {
    const atlassianClient = new AtlassianAPIClient({ accessToken });
    
    // Test different approaches to find comment mentions
    const tests = [
      {
        name: 'Search comments with mentions',
        cql: 'type = comment AND mention = currentUser()'
      },
      {
        name: 'Search comments by current user',
        cql: 'type = comment AND creator = currentUser()'
      },
      {
        name: 'Search for mentions in any content type',
        cql: 'mention = currentUser()'
      },
      {
        name: 'Search pages OR comments with mentions',
        cql: '(type = page OR type = comment) AND mention = currentUser()'
      },
      {
        name: 'Search by specific page title',
        cql: 'title ~ "Current Bedrock Model Access State"'
      },
      {
        name: 'Search recent content with mentions',
        cql: 'mention = currentUser() AND lastModified >= "2025-01-01"'
      }
    ];

    for (const test of tests) {
      console.log(`🧪 ${test.name}`);
      console.log(`   CQL: ${test.cql}`);
      
      const result = await atlassianClient.searchConfluenceContent(
        { cql: test.cql },
        20
      );
      
      if (result.success && result.data) {
        console.log(`✅ Found ${result.data.results.length} result(s)`);
        
        result.data.results.forEach((item, index) => {
          if (index < 5) { // Show first 5 results
            console.log(`   ${index + 1}. "${item.title}" (Type: ${item.type}, ID: ${item.id})`);
            
            // Check if this is related to the Bedrock page
            if (item.title?.includes('Bedrock') || item.id === '1376095103') {
              console.log(`   🎯 BEDROCK-RELATED CONTENT FOUND!`);
            }
          }
        });
      } else {
        console.log(`❌ Failed: ${result.error}`);
      }
      console.log();
    }

    // Try to get page details with comments
    console.log('🔍 Getting page details with comments...');
    try {
      const resources = await atlassianClient.getAccessibleResources();
      if (resources.success && resources.data && resources.data.length > 0) {
        const cloudId = resources.data[0].id;
        
        const response = await globalThis.fetch(
          `https://api.atlassian.com/ex/confluence/${cloudId}/rest/api/content/1376095103?expand=children.comment`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/json',
            },
          }
        );
        
        if (response.ok) {
          const pageData = await response.json();
          console.log('✅ Page details retrieved');
          console.log(`   Title: ${pageData.title}`);
          console.log(`   Type: ${pageData.type}`);
          
          if (pageData.children && pageData.children.comment) {
            console.log(`   Comments: ${pageData.children.comment.size} found`);
            if (pageData.children.comment.results) {
              pageData.children.comment.results.forEach((comment, index) => {
                console.log(`   Comment ${index + 1}: ID ${comment.id}`);
              });
            }
          } else {
            console.log('   Comments: Unable to retrieve comment details');
          }
        } else {
          console.log(`❌ Failed to get page details: ${response.status}`);
        }
      }
    } catch (error) {
      console.log(`❌ Error getting page details: ${error instanceof Error ? error.message : error}`);
    }
    
  } catch (error) {
    console.error('💥 Test failed:', error instanceof Error ? error.message : error);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  testCommentMentions().catch(console.error);
}