"""
Web 搜索与抓取服务 — DuckDuckGo 搜索 + httpx 抓取 + BeautifulSoup 正文提取。
"""
import logging
import re
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

from config import PROXY_DICT

logger = logging.getLogger(__name__)

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/125.0.0.0 Safari/537.36"
)

async def search_articles(
    topic: str = "random",
    max_results: int = 5,
) -> list[dict[str, str]]:
    """
    使用 Tavily Search API 搜索英文文章，返回 [{title, url, snippet, _full_text?}]。
    """
    from config import TAVILY_API_KEY

    if not TAVILY_API_KEY:
        logger.warning("TAVILY_API_KEY not configured")
        return []

    topic_queries = {
        "technology": "latest technology news article",
        "science": "recent science discovery article",
        "daily_life": "lifestyle wellness article",
        "computer": "computer programming software article",
        "military": "military defense news article",
        "news": "current news headline article",
        "health": "health medicine wellness article",
        "history": "history interesting facts article",
        "business": "business finance economy article",
    }
    query = topic_queries.get(topic, f"interesting {topic} article")

    proxy_url = None
    if PROXY_DICT:
        proxy_url = PROXY_DICT.get("http://") or PROXY_DICT.get("https://")

    try:
        async with httpx.AsyncClient(proxy=proxy_url, timeout=30.0) as client:
            resp = await client.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": TAVILY_API_KEY,
                    "query": query,
                    "search_depth": "basic",
                    "include_answer": True,
                    "include_raw_content": False,
                    "max_results": max_results,
                },
            )
            resp.raise_for_status()
            data = resp.json()

            results: list[dict[str, str]] = []
            for r in data.get("results", []):
                url = r.get("url", "")
                if url and _is_valid_article_url(url):
                    results.append({
                        "title": r.get("title", ""),
                        "url": url,
                        "snippet": r.get("content", ""),
                    })

            # 如果有 answer，追加为第一个结果（含全文）
            answer = data.get("answer", "")
            if answer and results:
                results[0]["_full_text"] = answer
                results[0]["snippet"] = answer[:500]

            return results[:max_results]
    except Exception as e:
        logger.error(f"Tavily search error: {e}")
        return []


async def scrape_article(url: str) -> str:
    """
    抓取网页并提取正文内容。
    """
    proxy_url = None
    if PROXY_DICT:
        proxy_url = PROXY_DICT.get("http://") or PROXY_DICT.get("https://")

    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
    }

    try:
        async with httpx.AsyncClient(
            proxy=proxy_url,
            timeout=15.0,
            follow_redirects=True,
            headers=headers,
        ) as client:
            response = await client.get(url)
            response.raise_for_status()
            html = response.text
    except httpx.HTTPStatusError as e:
        logger.warning(f"HTTP error scraping {url}: {e.response.status_code}")
        return ""
    except Exception as e:
        logger.warning(f"Failed to scrape {url}: {e}")
        return ""

    return extract_main_content(html)


def extract_main_content(html: str) -> str:
    """从 HTML 中提取正文内容（去除导航、广告、侧边栏等）。"""
    soup = BeautifulSoup(html, "lxml")

    # 移除不需要的元素
    for tag in soup.find_all(["script", "style", "nav", "footer", "header", "aside"]):
        tag.decompose()

    # 移除常见广告/无关 class
    for cls in ["advertisement", "sidebar", "comments", "related", "social", "nav"]:
        for tag in soup.find_all(class_=re.compile(cls, re.I)):
            tag.decompose()

    # 优先查找 <article> 标签
    article = soup.find("article")
    if article:
        text = article.get_text(separator="\n")
    else:
        # 尝试常见内容容器
        for selector in ["main", '[role="main"]', ".post-content", ".article-content", ".story-body"]:
            content = soup.select_one(selector)
            if content:
                text = content.get_text(separator="\n")
                break
        else:
            # fallback: 取 <body> 文本
            body = soup.find("body")
            text = body.get_text(separator="\n") if body else ""

    # 清洗文本
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    # 过滤过短的行（导航残片）和过长的行
    lines = [l for l in lines if 20 < len(l) < 2000]
    # 去重相邻重复行
    deduped = []
    for line in lines:
        if not deduped or line != deduped[-1]:
            deduped.append(line)

    return "\n\n".join(deduped)


def _is_valid_article_url(url: str) -> bool:
    """过滤无效 URL（非文章页、PDF、视频等）。"""
    if not url or not url.startswith("http"):
        return False
    parsed = urlparse(url)
    # 排除明显非文章的域名
    skip_domains = ["youtube.com", "twitter.com", "facebook.com", "instagram.com", "tiktok.com"]
    if any(d in parsed.netloc for d in skip_domains):
        return False
    # 排除非 HTML 资源
    skip_ext = [".pdf", ".mp4", ".mp3", ".jpg", ".png", ".gif", ".zip"]
    if any(parsed.path.lower().endswith(e) for e in skip_ext):
        return False
    return True
