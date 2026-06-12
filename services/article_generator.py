"""
文章生成编排服务 — 支持 search（网络搜索+LLM改写）和 ai（纯LLM生成）两种模式。
"""
import logging
import random as _random
import re

from .llm_client import LLMClient
from .web_scraper import search_articles, scrape_article
from .text_processor import (
    clean_article,
    split_paragraphs,
    generate_article_id,
    count_words,
)
from .translator import translate_vocabulary, extract_phrases

logger = logging.getLogger(__name__)

TOPICS = ["technology", "science", "daily_life"]


def _resolve_topic(topic: str) -> str:
    """如果 topic 为 random，从候选主题中随机选一个。"""
    if topic == "random":
        return _random.choice(TOPICS)
    return topic


# ─── AI 生成的 System Prompt ──────────────────────────

GENERATE_SYSTEM_PROMPT = """You are an English teacher creating reading materials for Chinese students learning English.

Generate an interesting, authentic English article based on the user's requirements.

Requirements:
- Difficulty: {difficulty} (beginner=vocal level ~2000 words/simple sentences, intermediate=~4000 words/complex sentences, advanced=native-level)
- Topic: {topic}
- Target length: about {word_count} words
- Content should be engaging and educational
- Use natural, contemporary English

Output format: Return ONLY the article text with a title on the first line. Separate paragraphs with a blank line. Do NOT include any meta-commentary or explanations."""

REWRITE_SYSTEM_PROMPT = """You are an English teacher adapting real-world articles for Chinese students learning English.

Rewrite the following web article to be suitable for English learners:

Requirements:
- Difficulty: {difficulty} (beginner=vocal level ~2000 words/simple sentences, intermediate=~4000 words/complex sentences, advanced=native-level)
- Target length: about {word_count} words
- Preserve the key information and facts from the original
- Simplify vocabulary and sentence structure as needed for the difficulty level
- Keep the article engaging and natural-sounding

Output format: Return ONLY the rewritten article with a title on the first line. Separate paragraphs with a blank line."""


def _extract_words(paragraphs: list[str]) -> list[str]:
    """从段落中提取所有唯一单词（排除 ≤2 字符和缩写）。"""
    seen = set()
    words = []
    for p in paragraphs:
        for w in re.findall(r"\b[a-zA-Z']{3,}\b", p):
            low = w.lower()
            if w.lower() in ("the", "and", "for", "are", "but", "not", "you", "all",
                             "can", "had", "her", "was", "one", "our", "out", "has",
                             "have", "from", "they", "that", "with", "this", "will",
                             "your", "which", "their", "them", "been", "were", "some",
                             "when", "who", "what", "how", "its", "his", "she", "him"):
                continue
            if low.endswith("'s") or low.endswith("'ll") or low.endswith("'re") or \
               low.endswith("'ve") or low.endswith("'d") or low.endswith("n't"):
                continue
            if w not in seen:
                seen.add(w)
                words.append(w)
    return words


async def generate_article(
    client: LLMClient,
    mode: str = "ai",
    topic: str = "random",
    difficulty: str = "intermediate",
    word_count: int = 300,
) -> dict:
    """
    生成文章的主入口。
    返回 ArticleData 的 dict 形式（含预翻译词汇表）。
    """
    article_id = generate_article_id()

    if mode == "search":
        result = await _generate_from_search(client, article_id, topic, difficulty, word_count)
    else:
        result = await _generate_from_ai(client, article_id, topic, difficulty, word_count)

    # 词汇和短语改为前端异步加载，此处不再阻塞
    result["vocabulary"] = []
    result["phrases"] = []

    return result


async def generate_article_stream(
    client: LLMClient,
    topic: str = "random",
    difficulty: str = "intermediate",
    word_count: int = 300,
):
    """
    流式生成文章 — 异步生成器，yield SSE 事件 dict。
    仅支持 AI 模式。
    """
    article_id = generate_article_id()

    # 发送 start 事件
    yield {"event": "start", "data": {"id": article_id}}

    resolved_topic = _resolve_topic(topic)
    prompt = GENERATE_SYSTEM_PROMPT.format(
        difficulty=difficulty,
        topic=resolved_topic,
        word_count=word_count,
    )
    messages = [
        {"role": "system", "content": prompt},
        {"role": "user", "content": f"Please generate an English article about {resolved_topic}."},
    ]

    full_text = ""
    async for chunk in client.chat_completion_stream(messages, temperature=0.8):
        full_text += chunk
        yield {"event": "chunk", "data": {"text": chunk}}

    # 处理生成结果
    cleaned = clean_article(full_text)
    paragraphs = split_paragraphs(cleaned)
    title = paragraphs[0] if paragraphs else "Untitled"
    if len(title) < 100 and len(paragraphs) > 1:
        paragraphs = paragraphs[1:]

    # 立即发送 done 事件（不阻塞等词汇/短语提取，前端 _preloadAfterRender 会异步加载）
    yield {
        "event": "done",
        "data": {
            "id": article_id,
            "title": title,
            "paragraphs": paragraphs,
            "vocabulary": [],
            "phrases": [],
            "source": "ai",
            "source_url": None,
            "difficulty": difficulty,
            "word_count": count_words("\n".join(paragraphs)),
        },
    }

    # 后台提取短语（通过后续 SSE 事件发送，前端收到后更新 DOM）
    full_article = "\n\n".join(paragraphs)
    try:
        phrases = await extract_phrases(client, full_article)
        if phrases:
            yield {"event": "phrases", "data": {"phrases": phrases}}
    except Exception:
        pass


async def _generate_from_ai(
    client: LLMClient,
    article_id: str,
    topic: str,
    difficulty: str,
    word_count: int,
) -> dict:
    """纯 AI 生成文章。"""
    resolved_topic = _resolve_topic(topic)
    prompt = GENERATE_SYSTEM_PROMPT.format(
        difficulty=difficulty,
        topic=resolved_topic,
        word_count=word_count,
    )
    messages = [
        {"role": "system", "content": prompt},
        {"role": "user", "content": f"Please generate an English article about {resolved_topic}."},
    ]
    raw_text = await client.chat_completion(messages, temperature=0.8)

    cleaned = clean_article(raw_text)
    paragraphs = split_paragraphs(cleaned)

    # 第一段通常是标题
    title = paragraphs[0] if paragraphs else "Untitled"
    if len(title) < 100 and len(paragraphs) > 1:
        paragraphs = paragraphs[1:]  # 移除标题行

    return {
        "id": article_id,
        "title": title,
        "paragraphs": paragraphs,
        "source": "ai",
        "source_url": None,
        "difficulty": difficulty,
        "word_count": count_words("\n".join(paragraphs)),
    }


async def _generate_from_search(
    client: LLMClient,
    article_id: str,
    topic: str,
    difficulty: str,
    word_count: int,
) -> dict:
    """通过网络搜索抓取文章，再用 LLM 改写。"""
    resolved_topic = _resolve_topic(topic)
    # 1. 搜索文章
    search_results = await search_articles(resolved_topic, max_results=5)
    if not search_results:
        # 降级为 AI 生成
        logger.warning("No search results found, falling back to AI generation")
        return await _generate_from_ai(client, article_id, topic, difficulty, word_count)

    # 2. 尝试抓取（直到成功抓到一个）
    raw_content = ""
    source_url = ""
    source_title = ""
    for result in search_results:
        content = await scrape_article(result["url"])
        if content and len(content) > 200:
            raw_content = content
            source_url = result["url"]
            source_title = result["title"]
            break

    if not raw_content:
        # 降级为 AI 生成
        logger.warning("Failed to scrape any article, falling back to AI generation")
        return await _generate_from_ai(client, article_id, topic, difficulty, word_count)

    # 3. 用 LLM 改写
    prompt = REWRITE_SYSTEM_PROMPT.format(
        difficulty=difficulty,
        word_count=word_count,
    )
    # 截断原文（避免超出 token 限制）
    truncated = raw_content[:3000]
    messages = [
        {"role": "system", "content": prompt},
        {"role": "user", "content": f"Original title: {source_title}\n\nOriginal article:\n{truncated}"},
    ]
    raw_text = await client.chat_completion(messages, temperature=0.6)

    cleaned = clean_article(raw_text)
    paragraphs = split_paragraphs(cleaned)

    title = paragraphs[0] if paragraphs else "Untitled"
    if len(title) < 100 and len(paragraphs) > 1:
        paragraphs = paragraphs[1:]

    return {
        "id": article_id,
        "title": title,
        "paragraphs": paragraphs,
        "source": "web",
        "source_url": source_url,
        "difficulty": difficulty,
        "word_count": count_words("\n".join(paragraphs)),
    }
