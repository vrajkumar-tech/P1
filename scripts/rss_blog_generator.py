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
import html
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
        self.gemini_api_key = os.getenv('GEMINI_API_KEY', '')
        self.gemini_model = os.getenv('GEMINI_MODEL', 'gemini-2.0-flash')
        self.gemini_api_name = "generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        self.gemini_model_fallbacks = [
            self.gemini_model,
            'gemini-2.0-flash',
            'gemini-1.5-flash',
            'gemini-1.5-flash-latest'
        ]
        
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
                    'title': self.clean_text(getattr(entry, 'title', 'Untitled Article')),
                    'link': entry.link,
                    'description': self.clean_text(getattr(entry, 'description', '') or getattr(entry, 'summary', '')),
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

    def get_latest_entries(self, entries: List[Dict], count: int = 10) -> List[Dict]:
        """Get the latest N entries sorted by publication date"""
        sorted_entries = sorted(entries, key=lambda item: item['pub_date'], reverse=True)
        latest_entries = sorted_entries[:count]
        logger.info(f"Selected latest {len(latest_entries)} entries")
        return latest_entries
    
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
            msg['X-RSS-Article-Link'] = link
            
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
        """Format detailed content with 5-7 exhaustive paragraphs"""
        clean_paragraphs = self.build_email_content(title, description, link)
        
        # Format each paragraph with read more link
        formatted_content = ""
        for i, paragraph in enumerate(clean_paragraphs):
            formatted_content += f"""
        <div class="paragraph">
            <p><strong>Paragraph {i+1}:</strong> {paragraph}</p>
            <a href="{link}" class="readmore">Read original article</a>
        </div>"""
        
        return formatted_content
    
    def build_email_content(self, title: str, description: str, link: str) -> List[str]:
        full_content = self.fetch_article_content(link)
        source_text = self.clean_text(full_content or description)

        gemini_paragraphs = self.expand_with_gemini(title, description, link, source_text)
        if gemini_paragraphs:
            return gemini_paragraphs

        clean_paragraphs = self.split_into_paragraphs(source_text)

        if not clean_paragraphs:
            clean_paragraphs = self.create_detailed_paragraphs(title, description, link)

        if len(clean_paragraphs) < 5:
            clean_paragraphs = self.expand_content(clean_paragraphs, title, description, 6)

        if len(clean_paragraphs) > 7:
            clean_paragraphs = clean_paragraphs[:7]

        return clean_paragraphs
    
    def create_detailed_paragraphs(self, title: str, description: str, link: str) -> List[str]:
        """Create detailed paragraphs when content is insufficient"""
        paragraphs = []
        
        # Paragraph 1: Introduction and context
        paragraphs.append(f"This article titled '{title}' provides important insights into current technological developments and innovations. The content explores significant trends and advancements that are shaping the future of technology and digital transformation.")
        
        # Paragraph 2: Main topic exploration
        paragraphs.append(f"The core focus of this discussion revolves around cutting-edge developments in the technology sector. Key aspects include emerging technologies, innovative solutions, and the impact on various industries and consumer experiences. These developments represent significant milestones in technological progress.")
        
        # Paragraph 3: Technical details and implications
        paragraphs.append(f"From a technical perspective, the article delves into the intricate details of implementation and deployment. The discussion covers architectural considerations, performance optimizations, and the technical challenges that developers and engineers face when working with advanced systems and platforms.")
        
        # Paragraph 4: Industry impact and applications
        paragraphs.append(f"The implications of these technological advancements extend across multiple industries, including healthcare, finance, education, and entertainment. Organizations are increasingly adopting these innovations to improve efficiency, reduce costs, and deliver enhanced value to their customers and stakeholders.")
        
        # Paragraph 5: Future outlook and predictions
        paragraphs.append(f"Looking ahead, industry experts predict continued growth and evolution in this technological domain. Future developments are expected to bring even more sophisticated capabilities, improved user experiences, and broader adoption across different sectors and demographics.")
        
        # Paragraph 6: Conclusion and call to action
        paragraphs.append(f"In conclusion, this article highlights the transformative power of technology and its role in driving progress and innovation. Readers are encouraged to stay informed about these developments and consider how they might leverage these advancements in their personal and professional endeavors.")
        
        return paragraphs
    
    def expand_content(self, paragraphs: List[str], title: str, description: str, target_count: int) -> List[str]:
        """Expand content to reach target paragraph count"""
        expanded = paragraphs.copy()
        
        while len(expanded) < target_count:
            # Create additional detailed paragraphs
            additional_para = self.generate_additional_paragraph(title, description, len(expanded))
            expanded.append(additional_para)
        
        return expanded
    
    def generate_additional_paragraph(self, title: str, description: str, index: int) -> str:
        """Generate additional detailed paragraph based on context"""
        templates = [
            f"The discussion on '{title}' further explores the regulatory and ethical considerations surrounding these technological innovations. As technology continues to advance, questions about privacy, security, and responsible usage become increasingly important for stakeholders and policymakers.",
            
            f"Market analysis reveals significant growth potential in the sector discussed in '{title}'. Investment patterns and market trends indicate strong confidence in these technologies, with venture capital and corporate investments driving further innovation and development.",
            
            f"User experience and accessibility are key themes that emerge from the analysis of '{title}'. The focus on creating intuitive, user-friendly interfaces demonstrates a commitment to making advanced technology accessible to broader audiences and diverse user groups.",
            
            f"The competitive landscape highlighted in '{title}' shows how different organizations are positioning themselves in this rapidly evolving market. Strategic partnerships, acquisitions, and research collaborations are shaping the future direction of technological development.",
            
            f"Environmental sustainability and energy efficiency considerations are increasingly important in the context of '{title}'. The industry is moving towards more sustainable practices and green technologies to address climate change and environmental concerns.",
            
            f"Education and skill development play crucial roles in the adoption and advancement of technologies discussed in '{title}'. The need for specialized talent and continuous learning programs highlights the importance of human capital in technological progress."
        ]
        
        return templates[index % len(templates)]
    
    def clean_text(self, value: str) -> str:
        """Convert HTML-heavy text into clean plain text"""
        if not value:
            return ""

        soup = BeautifulSoup(value, 'html.parser')
        text = soup.get_text(separator=' ', strip=True)
        text = html.unescape(text)
        text = re.sub(r'\s+', ' ', text)
        return text.strip()

    def split_into_paragraphs(self, content_text: str) -> List[str]:
        """Split article content into usable paragraph blocks"""
        if not content_text:
            return []

        raw_paragraphs = re.split(r'(?<=[.!?])\s{2,}|\n\s*\n+', content_text)
        paragraphs = []

        for paragraph in raw_paragraphs:
            paragraph = self.clean_text(paragraph)
            if len(paragraph) >= 80:
                paragraphs.append(paragraph)

        return paragraphs

    def expand_with_gemini(self, title: str, description: str, link: str, article_content: str) -> Optional[List[str]]:
        """Use Gemini to create 5-7 article-specific paragraphs"""
        if not self.gemini_api_key or not article_content:
            return None

        prompt = f"""Create exactly 6 detailed paragraphs for a blog email based strictly on the source article below.
Requirements:
- Use only the provided information.
- Do not invent facts.
- Each paragraph should be 3 to 5 sentences.
- Return plain text only.
- Separate each paragraph with a blank line.

Title: {title}
Link: {link}
Summary: {description}

Article Content:
{article_content[:12000]}
"""

        payload = {
            "contents": [
                {
                    "parts": [
                        {
                            "text": prompt
                        }
                    ]
                }
            ]
        }

        seen_models = set()

        for model_name in self.gemini_model_fallbacks:
            if not model_name or model_name in seen_models:
                continue

            seen_models.add(model_name)
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={self.gemini_api_key}"

            try:
                logger.info("Expanding content with Gemini model %s for article: %s", model_name, title)
                response = requests.post(url, json=payload, timeout=45)
                response.raise_for_status()
                data = response.json()
                candidates = data.get('candidates', [])
                if not candidates:
                    logger.warning("Gemini returned no candidates with model %s for article: %s", model_name, title)
                    continue

                parts = candidates[0].get('content', {}).get('parts', [])
                generated_text = "\n".join(part.get('text', '') for part in parts if part.get('text'))
                if not generated_text.strip():
                    logger.warning("Gemini returned empty text with model %s for article: %s", model_name, title)
                    continue

                paragraphs = [
                    self.clean_text(paragraph)
                    for paragraph in re.split(r'\n\s*\n+', generated_text)
                    if self.clean_text(paragraph)
                ]

                if len(paragraphs) < 5:
                    logger.warning("Gemini returned insufficient paragraphs with model %s for article: %s", model_name, title)
                    continue

                logger.info("Gemini expansion succeeded with model %s for article: %s", model_name, title)
                return paragraphs[:7]
            except Exception as e:
                logger.warning("Gemini model %s failed for article %s: %s", model_name, title, str(e))

        logger.error("Error expanding content with Gemini for %s: no configured Gemini model succeeded", title)
        return None
    
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
            logger.info("No recent entries found. Using latest 10 entries as fallback.")
            recent_entries = self.get_latest_entries(all_entries, 10)

        if not recent_entries:
            logger.info("No entries found at all. Skipping email.")
            return
        
        recent_entries.sort(key=lambda entry: entry['pub_date'], reverse=True)
        
        # Send individual emails for each recent entry
        successful_emails = 0
        for entry in recent_entries:
            logger.info("Preparing single-article email for: %s", entry['title'])
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
