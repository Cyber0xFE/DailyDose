"""
文本处理服务 — 清洗、段落分割、分词。
"""
import re
import uuid
from datetime import datetime


def clean_article(text: str) -> str:
    """清洗文章文本：去除多余空白、统一换行、去除特殊字符。"""
    # 统一换行为 \n
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    # 压缩连续空行为单个空行
    text = re.sub(r"\n{3,}", "\n\n", text)
    # 去除行首尾空白
    lines = [line.strip() for line in text.split("\n")]
    # 去除完全空白的开头/结尾行
    while lines and not lines[0]:
        lines.pop(0)
    while lines and not lines[-1]:
        lines.pop(-1)
    # 去除多于 1 个的空行
    result = []
    prev_empty = False
    for line in lines:
        if not line:
            if not prev_empty:
                result.append("")
            prev_empty = True
        else:
            result.append(line)
            prev_empty = False
    return "\n".join(result)


def split_paragraphs(text: str) -> list[str]:
    """将文本按空行分割为段落列表。"""
    cleaned = clean_article(text)
    paragraphs = [p.strip() for p in cleaned.split("\n\n") if p.strip()]
    return paragraphs


def generate_article_id() -> str:
    """生成文章唯一 ID。"""
    date_str = datetime.now().strftime("%Y%m%d")
    short_uuid = uuid.uuid4().hex[:6]
    return f"art_{date_str}_{short_uuid}"


def count_words(text: str) -> int:
    """统计文本中的英文单词数量。"""
    words = re.findall(r"[a-zA-Z]+", text)
    return len(words)


def extract_context(text: str, target_word: str, window: int = 5) -> str:
    """
    从文本中提取包含目标词的上下文片段。
    window: 目标词前后的词数（约等于 5-10 个词的窗口）
    """
    words = re.findall(r"\b[\w']+\b|[^\w\s]", text)
    # 找到目标词的位置
    target_lower = target_word.lower().strip()
    indices = []
    for i, w in enumerate(words):
        if w.lower().strip(",.!?;:\"'") == target_lower:
            indices.append(i)
    if not indices:
        return text[:200]  # fallback

    idx = indices[0]
    start = max(0, idx - window)
    end = min(len(words), idx + window + 1)
    context_words = words[start:end]
    # 重建上下文句子
    context = " ".join(context_words)
    # 清理多余空格（标点前不需要空格）
    context = re.sub(r"\s+([,.!?;:])", r"\1", context)
    return context
