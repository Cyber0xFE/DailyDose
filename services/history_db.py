"""
历史记录持久层 — SQLite 单表，WAL 模式。
"""
import json
import logging
from datetime import datetime

import aiosqlite
from pathlib import Path

logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).parent.parent / "daily_dose.db"
MAX_ITEMS = 50


async def get_db() -> aiosqlite.Connection:
    db = await aiosqlite.connect(str(DB_PATH))
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("""
        CREATE TABLE IF NOT EXISTS history (
            id              TEXT PRIMARY KEY,
            title           TEXT NOT NULL,
            paragraphs      TEXT NOT NULL,
            source          TEXT NOT NULL,
            source_url      TEXT,
            difficulty      TEXT NOT NULL,
            word_count      INTEGER NOT NULL,
            vocabulary      TEXT NOT NULL DEFAULT '[]',
            phrases         TEXT NOT NULL DEFAULT '[]',
            full_translation TEXT,
            fallback_reason TEXT NOT NULL DEFAULT '',
            created_at      TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    await db.execute(
        "CREATE INDEX IF NOT EXISTS idx_history_created_at ON history(created_at DESC)"
    )
    await db.execute("""
        CREATE TABLE IF NOT EXISTS vocab_book (
            id                   TEXT PRIMARY KEY,
            word                 TEXT NOT NULL,
            definition           TEXT NOT NULL,
            part_of_speech       TEXT NOT NULL DEFAULT '',
            source_article_title TEXT NOT NULL DEFAULT '',
            source_article_id    TEXT NOT NULL DEFAULT '',
            created_at           TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    await db.commit()
    return db


async def save_article(
    article,
    vocabulary: list | None = None,
    phrases: list | None = None,
    full_translation=None,
):
    db = await get_db()
    try:
        vocab_list = vocabulary if vocabulary is not None else article.vocabulary
        phrase_list = phrases if phrases is not None else article.phrases

        vocab_json = json.dumps(
            [v.model_dump() if hasattr(v, "model_dump") else v for v in vocab_list],
            ensure_ascii=False,
        )
        phrases_json = json.dumps(
            [p.model_dump() if hasattr(p, "model_dump") else p for p in phrase_list],
            ensure_ascii=False,
        )
        trans_json = (
            json.dumps(full_translation.model_dump(), ensure_ascii=False)
            if full_translation
            else None
        )

        # 检查是否已存在：首次插入记录本地时间，后续更新不触碰 created_at
        cursor = await db.execute("SELECT id FROM history WHERE id = ?", (article.id,))
        existing = await cursor.fetchone()

        if existing:
            await db.execute(
                """UPDATE history SET title=?, paragraphs=?, source=?, source_url=?,
                   difficulty=?, word_count=?, vocabulary=?, phrases=?,
                   full_translation=?, fallback_reason=?
                   WHERE id=?""",
                (
                    article.title,
                    json.dumps(article.paragraphs, ensure_ascii=False),
                    article.source,
                    article.source_url,
                    article.difficulty,
                    article.word_count,
                    vocab_json,
                    phrases_json,
                    trans_json,
                    article.fallback_reason,
                    article.id,
                ),
            )
        else:
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            await db.execute(
                """INSERT INTO history
                   (id, title, paragraphs, source, source_url, difficulty,
                    word_count, vocabulary, phrases, full_translation, fallback_reason, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    article.id,
                    article.title,
                    json.dumps(article.paragraphs, ensure_ascii=False),
                    article.source,
                    article.source_url,
                    article.difficulty,
                    article.word_count,
                    vocab_json,
                    phrases_json,
                    trans_json,
                    article.fallback_reason,
                    now,
                ),
            )
        await db.commit()

        # 超出上限则清理最旧记录
        await db.execute(
            """DELETE FROM history WHERE id NOT IN (
                   SELECT id FROM history ORDER BY created_at DESC LIMIT ?
               )""",
            (MAX_ITEMS,),
        )
        await db.commit()
    finally:
        await db.close()


async def list_history(limit: int = MAX_ITEMS) -> list[dict]:
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id, title, source, difficulty, word_count, created_at "
            "FROM history ORDER BY created_at DESC LIMIT ?",
            (limit,),
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]
    finally:
        await db.close()


async def get_article(article_id: str):
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM history WHERE id = ?", (article_id,)
        )
        row = await cursor.fetchone()
        if not row:
            return None
        d = dict(row)

        from models import ArticleData, VocabularyItem, PhraseItem

        return ArticleData(
            id=d["id"],
            title=d["title"],
            paragraphs=json.loads(d["paragraphs"]),
            source=d["source"],
            source_url=d.get("source_url"),
            difficulty=d["difficulty"],
            word_count=d["word_count"],
            vocabulary=[
                VocabularyItem.model_validate(v)
                for v in json.loads(d.get("vocabulary", "[]"))
            ],
            phrases=[
                PhraseItem.model_validate(p)
                for p in json.loads(d.get("phrases", "[]"))
            ],
            fallback_reason=d.get("fallback_reason", ""),
        )
    finally:
        await db.close()


async def get_full_translation(article_id: str):
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT full_translation FROM history WHERE id = ?", (article_id,)
        )
        row = await cursor.fetchone()
        if not row or not row[0]:
            return None

        from models import FullTranslateData

        return FullTranslateData.model_validate(json.loads(row[0]))
    finally:
        await db.close()


async def delete_article(article_id: str) -> bool:
    db = await get_db()
    try:
        cursor = await db.execute("DELETE FROM history WHERE id = ?", (article_id,))
        await db.commit()
        return cursor.rowcount > 0
    finally:
        await db.close()


async def clear_history() -> int:
    db = await get_db()
    try:
        cursor = await db.execute("DELETE FROM history")
        await db.commit()
        return cursor.rowcount
    finally:
        await db.close()


# ─── 生词本 CRUD ──────────────────────────────────────

async def add_vocab(
    word: str,
    definition: str,
    part_of_speech: str = "",
    source_article_title: str = "",
    source_article_id: str = "",
) -> dict:
    import uuid
    db = await get_db()
    try:
        entry_id = uuid.uuid4().hex
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        await db.execute(
            "INSERT INTO vocab_book (id, word, definition, part_of_speech, "
            "source_article_title, source_article_id, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (entry_id, word, definition, part_of_speech,
             source_article_title, source_article_id, now),
        )
        await db.commit()
        return {
            "id": entry_id,
            "word": word,
            "definition": definition,
            "part_of_speech": part_of_speech,
            "source_article_title": source_article_title,
            "source_article_id": source_article_id,
            "created_at": now,
        }
    finally:
        await db.close()


async def list_vocab() -> list[dict]:
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM vocab_book ORDER BY created_at DESC"
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]
    finally:
        await db.close()


async def delete_vocab(vocab_id: str) -> bool:
    db = await get_db()
    try:
        cursor = await db.execute(
            "DELETE FROM vocab_book WHERE id = ?", (vocab_id,)
        )
        await db.commit()
        return cursor.rowcount > 0
    finally:
        await db.close()
