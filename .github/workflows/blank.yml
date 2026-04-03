#!/usr/bin/env python3
"""
RSS to Blog Post Generator
Fetches RSS feeds from configured sources and generates individual detailed blog post emails
"""

import feedparser
import requests
import json
import os
import re
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import logging
from bs4 import BeautifulSoup

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class RSSBlogGenerator:
    def __init__(self):
        self.rss_feeds = [
            "https://www.theverge.com/rss/index.xml",
            "https://openai.com/blog/rss.xml",
            "https://openai.com/news/rss.xml"
        ]
        self.base_url = "https://rkoots.github.io/blog/"
        self.author = "rkoots"
        
    def fetch_feed_entries(self, feed_url: str) -> List[Dict]:
        """Fetch and parse RSS feed entries"""
        try:
            logger.info(f"Fetching feed: {feed_url}")
            feed = feedparser.parse(feed_url)
            entries = []
            
            for entry in feed.entries:
                # Parse publication date
                pub_date = None
                if hasattr(entry, 'published_parsed') and entry.published_parsed:
                    pub_date = datetime(*entry.published_parsed[:6])
                elif hasattr(entry, 'updated_parsed') and entry.updated_parsed:
                    pub_date = datetime(*entry.updated_parsed[:6])
                else:
                    pub_date = datetime.now()
                
                entries.append({
                    'title': entry.title,
                    'link': entry.link,
                    'description': getattr(entry, 'description', '') or getattr(entry, 'summary', ''),
                    'pub_date': pub_date,
                    'source': feed_url
                })
            
            logger.info(f"Found {len(entries)} entries in {feed_url}")
            return entries
            
        except Exception as e:
            logger.error(f"Error fetching feed {feed_url}: {str(e)}")
            return []
    
    def fetch_article_content(self, url: str) -> Optional[str]:
        """Fetch full article content from URL"""
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Remove script and style elements
            for script in soup(["script", "style"]):
                script.decompose()
            
            # Try to find main content
            content_selectors = [
                'article',
                '.article-content',
                '.post-content',
                '.entry-content',
                'main',
                '.content'
            ]
            
            content = None
            for selector in content_selectors:
                content = soup.select_one(selector)
                if content:
                    break
            
            if not content:
                # Fallback to body content
                content = soup.find('body')
            
            if content:
                # Clean up text
                text = content.get_text(separator='\n', strip=True)
                # Remove excessive whitespace
                text = re.sub(r'\n\s*\n', '\n\n', text)
                return text[:5000]  # Limit content length
            
        except Exception as e:
            logger.error(f"Error fetching content from {url}: {str(e)}")
        
        return None
    
    def generate_blog_post(self, entry: Dict) -> str:
        """Generate blog post content from RSS entry"""
        # Fetch full content
        full_content = self.fetch_article_content(entry['link'])
        
        # Generate slug
        slug = re.sub(r'[^\w\s-]', '', entry['title']).strip()
        slug = re.sub(r'[-\s]+', '-', slug).lower()
        
        # Create blog post
        date_str = entry['pub_date'].strftime('%Y-%m-%d')
        filename = f"{date_str}-{slug}.md"
        
        content = f"""---
layout: default
title: "{entry['title']}"
date: {date_str}
categories: blog
author: "{self.author}"
tags: ["Technology", "News", "AI", "Innovation"]
keywords: "technology, innovation, ai, news, tech trends"
description: "{entry['description'][:200]}..."
---

## Overview

{entry['description']}

## Article Summary

**Source**: [Original Article]({entry['link']})

**Published**: {entry['pub_date'].strftime('%B %d, %Y')}

**Author**: {self.author}

## Full Content

{full_content or entry['description']}

## Read More

This article was automatically generated from RSS feeds. For more tech insights and articles, visit our [blog homepage]({self.base_url}).

---

*This post was automatically generated using RSS feeds from leading technology sources. The original article can be found [here]({entry['link']}).*
"""
        
        return content, filename
    
    def filter_recent_entries(self, entries: List[Dict], hours: int = 1) -> List[Dict]:
        """Filter entries from the last N hours"""
        cutoff_time = datetime.now() - timedelta(hours=hours)
        recent_entries = []
        
        for entry in entries:
            if entry['pub_date'] > cutoff_time:
                recent_entries.append(entry)
        
        logger.info(f"Found {len(recent_entries)} entries from the last {hours} hour(s)")
        return recent_entries
    
    def send_email(self, title: str, content: str, link: str, pub_date: datetime) -> bool:
        """Send individual blog post via email"""
        try:
            # Email configuration (using environment variables)
            smtp_server = os.getenv('SMTP_SERVER', 'smtp.gmail.com')
            smtp_port = int(os.getenv('SMTP_PORT', '587'))
            sender_email = os.getenv('SENDER_EMAIL', 'market007ads@gmail.com')
            sender_password = os.getenv('SENDER_PASSWORD', '')
            recipient_email = os.getenv('RECIPIENT_EMAIL', 'rkoots.rkoots_autobot@blogger.com')
            
            if not sender_password:
                logger.error("Sender password not configured")
                return False
            
            # Create message
            msg = MIMEMultipart('alternative')
            msg['Subject'] = f"{title}"
            msg['From'] = sender_email
            msg['To'] = recipient_email
            
            # Create detailed email body with read more links after each paragraph
            email_body = f"""
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: #2c3e50; color: white; padding: 20px; border-radius: 5px 5px 0 0; }}
        .title {{ font-size: 24px; font-weight: bold; margin-bottom: 10px; }}
        .meta {{ font-size: 14px; opacity: 0.9; }}
        .content {{ padding: 20px; background: #f9f9f9; }}
        .paragraph {{ margin-bottom: 20px; text-align: justify; }}
        .readmore {{ display: block; margin-top: 10px; padding: 8px 16px; background: #3498db; color: white; text-decoration: none; border-radius: 4px; text-align: center; }}
        .readmore:hover {{ background: #2980b9; }}
        .footer {{ padding: 20px; background: #ecf0f1; border-radius: 0 0 5px 5px; text-align: center; font-size: 12px; color: #7f8c8d; }}
        .original-link {{ margin-top: 15px; padding: 10px; background: #e8f4f8; border-left: 4px solid #3498db; }}
    </style>
</head>
<body>
    <div class="header">
        <div class="title">{title}</div>
        <div class="meta">Published: {pub_date.strftime('%B %d, %Y at %H:%M')}</div>
    </div>
    
    <div class="content">
        {content}
    </div>
    
    <div class="original-link">
        <strong>Original Article:</strong> <a href="{link}" style="color: #3498db;">{link}</a>
    </div>
    
    <div class="footer">
        <p>This article was automatically generated from RSS feeds.</p>
        <p>Visit our blog for more tech insights: <a href="{self.base_url}" style="color: #3498db;">{self.base_url}</a></p>
    </div>
</body>
</html>
"""
            
            msg.attach(MIMEText(email_body, 'html'))
            
            # Send email
            logger.info(f"Sending email for article: {title}")
            server = smtplib.SMTP(smtp_server, smtp_port)
            server.starttls()
            server.login(sender_email, sender_password)
            server.send_message(msg)
            server.quit()
            
            logger.info(f"Email sent successfully for: {title}")
            return True
            
        except Exception as e:
            logger.error(f"Error sending email for {title}: {str(e)}")
            return False
    
    def format_detailed_content(self, title: str, description: str, link: str, pub_date: datetime) -> str:
        """Format detailed content with read more links after each paragraph"""
        # Fetch full content for detailed article
        full_content = self.fetch_article_content(link)
        
        # Use full content if available, otherwise use description
        content_text = full_content or description
        
        # Split content into paragraphs
        paragraphs = content_text.split('\n\n')
        
        # Clean up paragraphs and filter empty ones
        clean_paragraphs = []
        for para in paragraphs:
            para = para.strip()
            if para and len(para) > 50:  # Only include substantial paragraphs
                clean_paragraphs.append(para)
        
        # If no good paragraphs, use the description as fallback
        if not clean_paragraphs:
            clean_paragraphs = [description]
        
        # Format each paragraph with read more link
        formatted_content = ""
        for i, paragraph in enumerate(clean_paragraphs[:5]):  # Limit to 5 paragraphs
            formatted_content += f"""
        <div class="paragraph">
            <p>{paragraph}</p>
            <a href="{self.base_url}" class="readmore">Read more in rkoots</a>
        </div>"""
        
        return formatted_content
    
    def run(self):
        """Main execution function"""
        logger.info("Starting RSS Blog Generator")
        
        all_entries = []
        
        # Fetch all RSS feeds
        for feed_url in self.rss_feeds:
            entries = self.fetch_feed_entries(feed_url)
            all_entries.extend(entries)
        
        # Filter recent entries (last 1 hour)
        recent_entries = self.filter_recent_entries(all_entries, 1)
        
        if not recent_entries:
            logger.info("No recent entries found. Skipping email.")
            return
        
        # Send individual emails for each recent entry
        successful_emails = 0
        for entry in recent_entries:
            # Format detailed content
            detailed_content = self.format_detailed_content(
                entry['title'],
                entry['description'],
                entry['link'],
                entry['pub_date']
            )
            
            # Send individual email
            success = self.send_email(
                entry['title'],
                detailed_content,
                entry['link'],
                entry['pub_date']
            )
            
            if success:
                successful_emails += 1
        
        logger.info(f"Successfully sent {successful_emails}/{len(recent_entries)} emails")

if __name__ == "__main__":
    generator = RSSBlogGenerator()
    generator.run()
