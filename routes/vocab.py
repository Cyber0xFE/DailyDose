"""
生词本路由 — CRUD for vocabulary book.
"""
from fastapi import APIRouter

from models import AddVocabRequest
from services import history_db

router = APIRouter(prefix="/api/vocab", tags=["vocab"])


@router.get("")
async def list_vocab():
    items = await history_db.list_vocab()
    return {"success": True, "data": items}


@router.post("")
async def add_vocab(req: AddVocabRequest):
    entry = await history_db.add_vocab(
        word=req.word,
        definition=req.definition,
        part_of_speech=req.part_of_speech,
        source_article_title=req.source_article_title,
        source_article_id=req.source_article_id,
    )
    return {"success": True, "data": entry}


@router.delete("/{vocab_id}")
async def delete_vocab(vocab_id: str):
    deleted = await history_db.delete_vocab(vocab_id)
    if not deleted:
        return {"success": False, "error": "Entry not found"}
    return {"success": True, "message": "Deleted"}
