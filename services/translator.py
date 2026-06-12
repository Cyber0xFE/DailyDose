"""
翻译服务 — 单词释义 + 全文翻译。
"""
from .llm_client import LLMClient

# ─── 单词释义 Prompt ──────────────────────────────────

WORD_TRANSLATE_SYSTEM = """You are an English-Chinese dictionary for Chinese learners of English.

Given an English word or phrase and its context sentence, provide a detailed Chinese explanation.

Return your response in the following JSON format ONLY (no other text):
{
  "definition": "中文释义（包含多个义项时用分号分隔）",
  "part_of_speech": "词性 (noun/verb/adjective/adverb/phrase 等)",
  "synonyms": ["同义词1", "同义词2", "同义词3"],
  "example_sentence": "一个包含该词的英文例句"
}

Important:
- definition must be in Chinese
- If the word has multiple meanings, explain the one most relevant to the context
- Keep the definition concise but informative
- example_sentence should be a new sentence, not the context itself"""

FULL_TRANSLATE_SYSTEM = """You are a professional English-Chinese translator.

Translate the following English article into natural, fluent Chinese.

CRITICAL RULES:
- The input has exactly {paragraph_count} paragraphs (including the title as paragraph 1).
- Your paragraph_translations array MUST contain exactly {paragraph_count} items — no more, no less.
- Translate each paragraph AS A WHOLE. Do NOT split a paragraph into multiple translations even if it contains multiple sentences. One paragraph = one translation string.
- The first item is the title translation, followed by each body paragraph's translation in order.
- Maintain the original meaning and tone. Use natural Chinese expressions.

Return ONLY this JSON:
{{
  "translation": "全文中文翻译（连贯的完整翻译）",
  "paragraph_translations": ["标题翻译", "段落1翻译", "段落2翻译", ...]
}}"""


async def translate_word(
    client: LLMClient,
    word: str,
    context: str = "",
) -> dict:
    """翻译单词/短语，返回中文释义。"""
    user_message = f"Word: {word}"
    if context:
        user_message += f"\nContext: {context}"

    messages = [
        {"role": "system", "content": WORD_TRANSLATE_SYSTEM},
        {"role": "user", "content": user_message},
    ]
    raw = await client.chat_completion(messages, temperature=0.3, max_tokens=2000)

    # 解析 JSON 响应
    import json
    try:
        # 尝试清理可能的 markdown 代码块包装
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1]
            if raw.endswith("```"):
                raw = raw[:-3]
        data = json.loads(raw)
        return {
            "word": word,
            "definition": data.get("definition", ""),
            "part_of_speech": data.get("part_of_speech", ""),
            "synonyms": data.get("synonyms", []),
            "example_sentence": data.get("example_sentence", ""),
        }
    except (json.JSONDecodeError, KeyError):
        # fallback: 直接使用原始响应作为释义
        return {
            "word": word,
            "definition": raw,
            "part_of_speech": "",
            "synonyms": [],
            "example_sentence": "",
        }


VOCABULARY_SYSTEM = """You are an English-Chinese dictionary for Chinese learners of English.

Given a list of English words from an article, provide a Chinese explanation for EACH word.

Return your response in the following JSON format ONLY (no other text):
{
  "vocabulary": [
    {
      "word": "example",
      "definition": "中文释义",
      "part_of_speech": "noun/verb/adjective 等",
      "synonyms": ["同义词1", "同义词2"],
      "example_sentence": "一个包含该词的英文例句"
    }
  ]
}

Important:
- Provide an entry for EVERY word in the list, no skipping
- definition must be in Chinese, concise but informative
- For words with multiple meanings, give the most common one
- example_sentence should be a NEW sentence, not from context"""


async def translate_vocabulary(
    client: LLMClient,
    words: list[str],
) -> list[dict]:
    """批量翻译词汇，一次 LLM 调用处理最多 30 个词。"""
    if not words:
        return []

    word_list = "\n".join(f"- {w}" for w in words)
    user_message = f"Words to define:\n{word_list}"

    messages = [
        {"role": "system", "content": VOCABULARY_SYSTEM},
        {"role": "user", "content": user_message},
    ]
    raw = await client.chat_completion(messages, temperature=0.3, max_tokens=8000)

    import json
    try:
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1]
            if raw.endswith("```"):
                raw = raw[:-3]
        data = json.loads(raw)
        return data.get("vocabulary", [])
    except (json.JSONDecodeError, KeyError):
        return []


PHRASE_SYSTEM = """You are an English teacher helping Chinese students learn English.

From the following English article, identify 8-15 useful phrases, collocations, idioms, or fixed expressions that learners should know.

Criteria:
- Multi-word expressions (2-5 words) that have a meaning beyond the individual words
- Common collocations (e.g., "take care of", "make a decision", "in spite of")
- Phrasal verbs with particles (e.g., "look forward to", "give up")
- NOT single words or full sentences

Return JSON ONLY:
{
  "phrases": [
    {"text": "look forward to", "definition": "期待，盼望"},
    {"text": "take care of", "definition": "照顾，处理"}
  ]
}

Important:
- definition must be in Chinese, concise
- text must be the exact phrase as it appears in the article (matching case)"""


async def extract_phrases(
    client: LLMClient,
    article_text: str,
) -> list[dict]:
    """从文章中提取有用短语并翻译。"""
    messages = [
        {"role": "system", "content": PHRASE_SYSTEM},
        {"role": "user", "content": f"Article:\n{article_text[:3000]}"},
    ]
    raw = await client.chat_completion(messages, temperature=0.3, max_tokens=8000)

    if not raw:
        return []  # 推理模型可能耗尽了 token，content 为空

    import json
    try:
        raw = raw.strip()
        if raw.startswith("```"):
            parts = raw.split("\n")
            raw = "\n".join(parts[1:])
            if raw.rstrip().endswith("```"):
                raw = raw.rstrip()[:-3]
        data = json.loads(raw)
        return data.get("phrases", [])
    except (json.JSONDecodeError, KeyError):
        # 尝试修复截断的 JSON：补全末尾
        try:
            fixed = raw.rstrip()
            if fixed.endswith(","):
                fixed = fixed[:-1]  # 去掉尾部多余逗号
            if not fixed.rstrip().endswith("]"):
                fixed = fixed.rstrip() + "\n  ]\n}"
            return json.loads(fixed).get("phrases", [])
        except Exception:
            return []


async def translate_full(
    client: LLMClient,
    content: str,
    paragraphs: list[str] | None = None,
) -> dict:
    """全文翻译。"""
    if paragraphs is None:
        paragraphs = [content]

    para_count = len(paragraphs)
    system_prompt = FULL_TRANSLATE_SYSTEM.format(paragraph_count=para_count)
    user_message = f"Article to translate:\n\n{content}"

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]
    raw = await client.chat_completion(messages, temperature=0.3, max_tokens=8192)

    import json
    import re
    try:
        raw = raw.strip()
        # 去掉可能的 markdown 代码块
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1]
            if raw.rstrip().endswith("```"):
                raw = raw.rstrip()[:-3]
        # 用正则提取第一个完整 JSON 对象（兼容 LLM 输出中夹杂的解释文字）
        m = re.search(r'\{[\s\S]*\}', raw)
        if m:
            raw = m.group()
        data = json.loads(raw)
        p_trans = data.get("paragraph_translations", [])
        # 校验：翻译段落数必须与原文段落数一致，否则回退到单段模式
        if len(p_trans) != para_count:
            p_trans = []
        return {
            "translation": data.get("translation", ""),
            "paragraph_translations": p_trans,
        }
    except (json.JSONDecodeError, KeyError):
        return {
            "translation": raw,
            "paragraph_translations": [],
        }
