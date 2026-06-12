"""
Pydantic 数据模型 — 请求/响应验证。
"""
from pydantic import BaseModel, Field
from typing import Literal, Optional


# ─── LLM 配置 ─────────────────────────────────────────

class LLMConfig(BaseModel):
    endpoint: str = Field(..., description="LLM API 端点 URL")
    api_key: str = Field(..., description="API Key")
    model_name: str = Field(default="gpt-4o", description="模型名称")


class LLMConfigResponse(BaseModel):
    endpoint: str
    model_name: str
    api_key_masked: str
    is_configured: bool


# ─── 文章生成 ─────────────────────────────────────────

class ArticleRequest(BaseModel):
    mode: Literal["search", "ai"] = Field(default="ai", description="生成方式")
    topic: str = Field(default="random", description="主题偏好")
    difficulty: Literal["beginner", "intermediate", "advanced"] = Field(
        default="intermediate", description="难度等级"
    )
    word_count: int = Field(default=300, ge=50, le=1000, description="目标字数")


class VocabularyItem(BaseModel):
    word: str
    definition: str
    part_of_speech: str = ""
    synonyms: list[str] = []
    example_sentence: str = ""


class PhraseItem(BaseModel):
    text: str
    definition: str


class ArticleData(BaseModel):
    id: str
    title: str
    paragraphs: list[str]
    source: Literal["web", "ai"]
    source_url: Optional[str] = None
    difficulty: str
    word_count: int
    vocabulary: list[VocabularyItem] = []
    phrases: list[PhraseItem] = []


class ArticleResponse(BaseModel):
    success: bool
    data: Optional[ArticleData] = None
    error: Optional[str] = None


# ─── 单词翻译 ─────────────────────────────────────────

class WordTranslateRequest(BaseModel):
    word: str = Field(..., min_length=1, description="要查询的单词或短语")
    context: str = Field(default="", description="上下文句子")


class WordTranslateData(BaseModel):
    word: str
    definition: str
    part_of_speech: str = ""
    synonyms: list[str] = []
    example_sentence: str = ""


class WordTranslateResponse(BaseModel):
    success: bool
    data: Optional[WordTranslateData] = None
    error: Optional[str] = None


# ─── 全文翻译 ─────────────────────────────────────────

class FullTranslateRequest(BaseModel):
    content: str = Field(..., description="全文内容")
    paragraphs: list[str] = Field(default_factory=list)


class FullTranslateData(BaseModel):
    translation: str
    paragraph_translations: list[str] = []


class FullTranslateResponse(BaseModel):
    success: bool
    data: Optional[FullTranslateData] = None
    error: Optional[str] = None


# ─── 批量词汇预加载 ───────────────────────────────────

class VocabularyRequest(BaseModel):
    words: list[str] = Field(..., min_length=1, max_length=30, description="要预翻译的单词列表")


class VocabularyData(BaseModel):
    vocabulary: list[VocabularyItem]


class VocabularyResponse(BaseModel):
    success: bool
    data: Optional[VocabularyData] = None
    error: Optional[str] = None


# ─── 短语提取（按钮触发） ──────────────────────────────

class PhraseExtractRequest(BaseModel):
    paragraphs: list[str] = Field(..., min_length=1, description="文章段落列表")


class PhraseExtractData(BaseModel):
    phrases: list[PhraseItem]


class PhraseExtractResponse(BaseModel):
    success: bool
    data: Optional[PhraseExtractData] = None
    error: Optional[str] = None


# ─── 通用 ─────────────────────────────────────────────

class TestConnectionResponse(BaseModel):
    success: bool
    message: str
    model_responded: str = ""
    latency_ms: int = 0
