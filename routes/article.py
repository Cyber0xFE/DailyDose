"""
文章生成路由 — POST /api/article/generate, /api/article/generate-stream
"""
import json
import logging

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from models import ArticleRequest, ArticleResponse, PhraseExtractRequest, PhraseExtractResponse, PhraseExtractData
from services.llm_client import LLMClient
from services.article_generator import generate_article, generate_article_stream
from services.translator import extract_phrases

router = APIRouter(prefix="/api/article", tags=["article"])
logger = logging.getLogger(__name__)


def _get_client(request: Request) -> LLMClient | None:
    """从已保存配置创建 LLM 客户端。"""
    config = getattr(request.app.state, "llm_config", {})
    if not config:
        return None
    return LLMClient(
        endpoint=config["endpoint"],
        api_key=config["api_key"],
        model_name=config["model_name"],
    )


@router.post("/generate", response_model=ArticleResponse)
async def generate(req: ArticleRequest, request: Request):
    client = _get_client(request)
    if not client:
        return ArticleResponse(
            success=False,
            error="LLM not configured. Please configure your API in Settings first.",
        )

    try:
        data = await generate_article(
            client=client,
            mode=req.mode,
            topic=req.topic,
            difficulty=req.difficulty,
            word_count=req.word_count,
        )
        await client.close()
        return ArticleResponse(success=True, data=data)
    except Exception as e:
        await client.close()
        return ArticleResponse(success=False, error=str(e))


@router.post("/phrases", response_model=PhraseExtractResponse)
async def extract_article_phrases(req: PhraseExtractRequest, request: Request):
    """提取文章中的短语（按钮触发，异步调用）。"""
    client = _get_client(request)
    if not client:
        return PhraseExtractResponse(
            success=False,
            error="LLM not configured.",
        )

    try:
        full_text = "\n\n".join(req.paragraphs)
        phrases = await extract_phrases(client, full_text)
        await client.close()
        return PhraseExtractResponse(
            success=True,
            data=PhraseExtractData(phrases=phrases),
        )
    except Exception as e:
        await client.close()
        return PhraseExtractResponse(success=False, error=str(e))


@router.post("/generate-stream")
async def generate_stream(req: ArticleRequest, request: Request):
    """SSE 流式生成文章（仅 AI 模式）。"""
    client = _get_client(request)
    if not client:
        async def error_stream():
            err = json.dumps({"event": "error", "data": {"message": "LLM not configured"}})
            yield f"event: error\ndata: {err}\n\n"
        return StreamingResponse(error_stream(), media_type="text/event-stream")

    async def event_stream():
        try:
            async for event in generate_article_stream(
                client=client,
                topic=req.topic,
                difficulty=req.difficulty,
                word_count=req.word_count,
            ):
                data = json.dumps(event["data"], ensure_ascii=False)
                yield f"event: {event['event']}\ndata: {data}\n\n"
        except Exception as e:
            logger.exception("Stream generation failed")
            err = json.dumps({"message": str(e)}, ensure_ascii=False)
            yield f"event: error\ndata: {err}\n\n"
        finally:
            await client.close()

    return StreamingResponse(event_stream(), media_type="text/event-stream")
