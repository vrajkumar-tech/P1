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
from urllib.parse import urlparse
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
            'gemini-2.0-flash-lite',
            'gemini-1.5-pro'
        ]
        self.invalid_gemini_models = set()
        self.gemini_backoff_until = None
        
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
            source_name = self.get_source_name(link)
            
            # Create structured email body for a clearer reading experience
            email_body = f"""
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.7; color: #1f2937; max-width: 720px; margin: 0 auto; padding: 24px; background: #f3f6fb; }}
        .container {{ background: #ffffff; border: 1px solid #dbe4f0; border-radius: 14px; overflow: hidden; }}
        .header {{ background: linear-gradient(135deg, #1f3c88, #2563eb); color: white; padding: 28px; }}
        .eyebrow {{ font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.85; margin-bottom: 8px; }}
        .title {{ font-size: 28px; font-weight: bold; line-height: 1.3; margin-bottom: 14px; }}
        .meta {{ font-size: 14px; opacity: 0.95; }}
        .content {{ padding: 28px; background: #ffffff; }}
        .section {{ margin-bottom: 28px; }}
        .section-title {{ font-size: 20px; font-weight: bold; color: #0f172a; margin-bottom: 12px; }}
        .intro {{ font-size: 16px; color: #334155; }}
        .article-body p {{ margin: 0 0 16px 0; text-align: left; }}
        .article-body p:last-child {{ margin-bottom: 0; }}
        .highlights {{ margin: 0; padding-left: 20px; color: #334155; }}
        .highlights li {{ margin-bottom: 10px; }}
        .cta-box {{ background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 18px; }}
        .button {{ display: inline-block; margin-top: 12px; padding: 11px 18px; background: #2563eb; color: white !important; text-decoration: none; border-radius: 8px; font-weight: bold; }}
        .metadata-grid {{ background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; }}
        .metadata-row {{ margin-bottom: 8px; }}
        .metadata-row:last-child {{ margin-bottom: 0; }}
        .label {{ font-weight: bold; color: #0f172a; }}
        .footer {{ padding: 22px 28px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 13px; color: #64748b; }}
        a {{ color: #2563eb; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="eyebrow">Curated RSS Brief</div>
            <div class="title">{html.escape(title)}</div>
            <div class="meta">Published: {pub_date.strftime('%B %d, %Y at %H:%M')} | Source: {html.escape(source_name)}</div>
        </div>

        <div class="content">
            {content}
        </div>

        <div class="footer">
            <div>This article email was generated from your RSS automation workflow.</div>
            <div>Blog home: <a href="{self.base_url}">{self.base_url}</a></div>
        </div>
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
        """Format article content into a structured, reader-friendly email layout"""
        clean_paragraphs = self.build_email_content(title, description, link)

        summary_paragraph = clean_paragraphs[0] if clean_paragraphs else self.clean_text(description)
        highlight_items = self.extract_key_points(clean_paragraphs, summary_paragraph)
        detailed_sections = clean_paragraphs[1:] if len(clean_paragraphs) > 1 else [summary_paragraph]
        detailed_html = "".join(
            f"<p>{html.escape(paragraph)}</p>" for paragraph in detailed_sections if paragraph
        )
        highlights_html = "".join(
            f"<li>{html.escape(item)}</li>" for item in highlight_items
        )

        return f"""
        <div class="section">
            <div class="section-title">Quick Summary</div>
            <div class="intro">{html.escape(summary_paragraph)}</div>
        </div>

        <div class="section">
            <div class="section-title">Key Takeaways</div>
            <ul class="highlights">
                {highlights_html}
            </ul>
        </div>

        <div class="section">
            <div class="section-title">Detailed Coverage</div>
            <div class="article-body">
                {detailed_html}
            </div>
        </div>

        <div class="section">
            <div class="section-title">Article Details</div>
            <div class="metadata-grid">
                <div class="metadata-row"><span class="label">Published:</span> {pub_date.strftime('%B %d, %Y at %H:%M')}</div>
                <div class="metadata-row"><span class="label">Source:</span> {html.escape(self.get_source_name(link))}</div>
                <div class="metadata-row"><span class="label">Original link:</span> <a href="{link}">{html.escape(link)}</a></div>
            </div>
        </div>

        <div class="section">
            <div class="cta-box">
                <div class="section-title" style="margin-bottom: 8px;">Read the Full Article</div>
                <div>If you want the exact wording, examples, or full context from the publisher, open the original source article.</div>
                <a href="{link}" class="button">Open Original Article</a>
            </div>
        </div>"""
    
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

    def get_source_name(self, link: str) -> str:
        """Return a clean source name from a URL"""
        try:
            hostname = urlparse(link).netloc.lower()
            hostname = re.sub(r'^www\.', '', hostname)
            if not hostname:
                return "Unknown source"

            return hostname.split(':')[0]
        except Exception:
            return "Unknown source"

    def extract_key_points(self, paragraphs: List[str], fallback_summary: str) -> List[str]:
        """Build concise highlight bullets from article paragraphs"""
        candidates = []

        for paragraph in paragraphs:
            sentences = re.split(r'(?<=[.!?])\s+', paragraph)
            for sentence in sentences:
                cleaned = self.clean_text(sentence)
                if 45 <= len(cleaned) <= 220:
                    candidates.append(cleaned)
                if len(candidates) >= 4:
                    break
            if len(candidates) >= 4:
                break

        if not candidates and fallback_summary:
            candidates.append(self.clean_text(fallback_summary))

        return candidates[:4]
    
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

        if self.gemini_backoff_until and datetime.now() < self.gemini_backoff_until:
            logger.info("Skipping Gemini expansion for %s because backoff is active until %s", title, self.gemini_backoff_until.isoformat())
            return None

        prompt = f"""Create a structured article digest for an email newsletter based strictly on the source article below.
Requirements:
- Use only the provided information.
- Do not invent facts.
- Start with 1 concise summary paragraph.
- Then write 3 to 5 detailed paragraphs.
- Keep the writing natural and readable, not repetitive.
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
            if not model_name or model_name in seen_models or model_name in self.invalid_gemini_models:
                continue

            seen_models.add(model_name)
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={self.gemini_api_key}"

            try:
                logger.info("Expanding content with Gemini model %s for article: %s", model_name, title)
                response = requests.post(url, json=payload, timeout=45)

                if response.status_code == 404:
                    self.invalid_gemini_models.add(model_name)
                    logger.warning("Gemini model %s is unavailable (404) and will be skipped in later attempts", model_name)
                    continue

                if response.status_code == 429:
                    self.gemini_backoff_until = datetime.now() + timedelta(minutes=15)
                    logger.warning("Gemini rate limit reached with model %s. Backing off until %s", model_name, self.gemini_backoff_until.isoformat())
                    return None

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

                if len(paragraphs) < 4:
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
