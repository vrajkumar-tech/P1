#!/usr/bin/env python3
"""
Test script for RSS Blog Generator
Run this locally to test the functionality before deploying
"""

import os
import sys
from datetime import datetime

# Add scripts directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from rss_blog_generator import RSSBlogGenerator

def test_rss_fetching():
    """Test RSS feed fetching"""
    print("Testing RSS feed fetching...")
    generator = RSSBlogGenerator()
    
    for feed_url in generator.rss_feeds:
        entries = generator.fetch_feed_entries(feed_url)
        print(f"Feed: {feed_url}")
        print(f"Entries found: {len(entries)}")
        if entries:
            print(f"Latest entry: {entries[0]['title']}")
            print(f"Published: {entries[0]['pub_date']}")
        print("-" * 50)

def test_content_fetching():
    """Test article content fetching"""
    print("\nTesting content fetching...")
    generator = RSSBlogGenerator()
    
    # Get a sample entry
    entries = generator.fetch_feed_entries(generator.rss_feeds[0])
    if entries:
        entry = entries[0]
        print(f"Fetching content for: {entry['title']}")
        content = generator.fetch_article_content(entry['link'])
        if content:
            print(f"Content length: {len(content)} characters")
            print(f"Content preview: {content[:200]}...")
        else:
            print("No content fetched")

def test_email_formatting():
    """Test email formatting"""
    print("\nTesting email formatting...")
    generator = RSSBlogGenerator()
    
    # Create sample entry
    sample_entry = {
        'title': 'Test Article Title',
        'description': 'This is a test article description that demonstrates the email formatting functionality.',
        'link': 'https://example.com/article',
        'pub_date': datetime.now()
    }
    
    email_content = generator.format_blog_post_for_email(
        sample_entry['title'],
        sample_entry['description'],
        sample_entry['link'],
        sample_entry['pub_date']
    )
    
    print("Email content preview:")
    print(email_content)

def test_recent_filtering():
    """Test filtering recent entries"""
    print("\nTesting recent entry filtering...")
    generator = RSSBlogGenerator()
    
    # Get all entries
    all_entries = []
    for feed_url in generator.rss_feeds:
        entries = generator.fetch_feed_entries(feed_url)
        all_entries.extend(entries)
    
    print(f"Total entries found: {len(all_entries)}")
    
    # Filter recent entries (last 24 hours for testing)
    recent_entries = generator.filter_recent_entries(all_entries, 24)
    print(f"Recent entries (last 24 hours): {len(recent_entries)}")
    
    if recent_entries:
        print("Recent entries:")
        for entry in recent_entries[:5]:  # Show first 5
            print(f"  - {entry['title']} ({entry['pub_date']})")

if __name__ == "__main__":
    print("RSS Blog Generator Test Suite")
    print("=" * 50)
    
    try:
        test_rss_fetching()
        test_content_fetching()
        test_email_formatting()
        test_recent_filtering()
        
        print("\n" + "=" * 50)
        print("All tests completed successfully!")
        
    except Exception as e:
        print(f"\nTest failed with error: {str(e)}")
        import traceback
        traceback.print_exc()
