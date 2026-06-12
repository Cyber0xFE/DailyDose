"""
翻译路由 — POST /api/translate/word, POST /api/translate/full
"""
from fastapi import APIRouter, Request

from models import (
    WordTranslateRequest,
    WordTranslateResponse,
    FullTranslateRequest,
    FullTranslateResponse,
    VocabularyRequest,
    VocabularyResponse,
    VocabularyData,
)
from services.llm_client import LLMClient
from services.translator import translate_word, translate_full, translate_vocabulary

router = APIRouter(prefix="/api/translate", tags=["translate"])


def _get_client(request: Request) -> LLMClient | None:
    config = getattr(request.app.state, "llm_config", {})
    if not config:
        return None
    return LLMClient(
        endpoint=config["endpoint"],
        api_key=config["api_key"],
        model_name=config["model_name"],
    )


@router.post("/word", response_model=WordTranslateResponse)
async def word(req: WordTranslateRequest, request: Request):
    client = _get_client(request)
    if not client:
        return WordTranslateResponse(
            success=False,
            error="LLM not configured. Please configure your API in Settings first.",
        )

    try:
        data = await translate_word(
            client=client,
            word=req.word,
            context=req.context,
        )
        await client.close()
        return WordTranslateResponse(success=True, data=data)
    except Exception as e:
        await client.close()
        return WordTranslateResponse(success=False, error=str(e))


@router.post("/vocabulary", response_model=VocabularyResponse)
async def vocabulary(req: VocabularyRequest, request: Request):
    client = _get_client(request)
    if not client:
        return VocabularyResponse(
            success=False,
            error="LLM not configured. Please configure your API in Settings first.",
        )

    try:
        data = await translate_vocabulary(
            client=client,
            words=req.words,
        )
        await client.close()
        return VocabularyResponse(
            success=True,
            data=VocabularyData(vocabulary=data),
        )
    except Exception as e:
        await client.close()
        return VocabularyResponse(success=False, error=str(e))


@router.post("/full", response_model=FullTranslateResponse)
async def full(req: FullTranslateRequest, request: Request):
    client = _get_client(request)
    if not client:
        return FullTranslateResponse(
            success=False,
            error="LLM not configured. Please configure your API in Settings first.",
        )

    try:
        data = await translate_full(
            client=client,
            content=req.content,
            paragraphs=req.paragraphs,
        )
        await client.close()
        return FullTranslateResponse(success=True, data=data)
    except Exception as e:
        await client.close()
        return FullTranslateResponse(success=False, error=str(e))
