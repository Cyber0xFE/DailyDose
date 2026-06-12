"""
历史记录路由 — CRUD for article history.
"""
from fastapi import APIRouter

from models import SaveHistoryRequest
from services import history_db

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("")
async def list_history():
    items = await history_db.list_history()
    return {"success": True, "data": items}


@router.get("/{article_id}")
async def get_history_detail(article_id: str):
    article = await history_db.get_article(article_id)
    if not article:
        return {"success": False, "error": "Article not found"}

    translation = await history_db.get_full_translation(article_id)

    return {
        "success": True,
        "data": {
            "article": article.model_dump(),
            "full_translation": translation.model_dump() if translation else None,
        },
    }


@router.post("")
async def save_history(req: SaveHistoryRequest):
    await history_db.save_article(
        article=req.article,
        vocabulary=req.vocabulary,
        phrases=req.phrases,
        full_translation=req.full_translation,
    )
    return {"success": True, "message": "Saved to history"}


@router.delete("/{article_id}")
async def delete_history_item(article_id: str):
    deleted = await history_db.delete_article(article_id)
    if not deleted:
        return {"success": False, "error": "Article not found"}
    return {"success": True, "message": "Deleted"}


@router.delete("")
async def clear_history():
    count = await history_db.clear_history()
    return {"success": True, "message": f"Deleted {count} items"}


@router.post("/clear-translations")
async def clear_translations():
    count = await history_db.clear_translations()
    return {"success": True, "message": f"已清除 {count} 篇文章的翻译缓存"}


@router.post("/clear-phrases")
async def clear_phrases():
    count = await history_db.clear_phrases()
    return {"success": True, "message": f"已清除 {count} 篇文章的短语缓存"}
