# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

DailyDose — 英语学习 Web 应用，为中文母语者生成分级英语阅读文章。后端 FastAPI + 前端原生 HTML/CSS/JS。

## 常用命令

```bash
# 启动开发服务器 (http://127.0.0.1:8000)
python main.py

# 安装依赖
pip install -r requirements.txt
```

无测试套件、lint 或构建步骤。

## 架构概览

**路由层** (`routes/`) — FastAPI APIRouter，薄层，仅做参数提取和错误包装：
- `article.py` — `/api/article/generate`（普通）、`/api/article/generate-stream`（SSE 流式，仅 AI 模式）、`/api/article/phrases`（短语提取）
- `translate.py` — `/api/translate/word`、`/api/translate/vocabulary`（批量）、`/api/translate/full`
- `settings.py` — `/api/settings/llm` 的 CRUD + 连接测试

**服务层** (`services/`) — 所有业务逻辑：
- `llm_client.py` — 封装 OpenAI SDK (`AsyncOpenAI`)，支持自定义 endpoint、代理和流式
- `article_generator.py` — 文章生成编排：AI 模式用 system prompt 生成，search 模式走 Tavily 搜索 → 网页抓取 → LLM 改写。两种模式均在返回时词语/短语留空，由前端异步加载
- `web_scraper.py` — Tavily Search API 搜索 + httpx 网页抓取 + BeautifulSoup 正文提取（支持 `<article>`、`main`、常见 content class 等选择器级联回退）
- `translator.py` — 单词/批量词汇/短语/全文翻译，均通过 LLM prompt 返回 JSON
- `text_processor.py` — 纯函数工具：文本清洗、段落分割、ID 生成、单词计数

**数据模型** (`models.py`) — Pydantic v2 请求/响应模型，所有 API 契约集中于此。

**配置** (`config.py`) — `python-dotenv` 加载 `.env`，提供 LLM 默认端点/密钥/模型、Tavily API Key、代理设置。`.env` 不会被提交。

**前端** (`static/`) — 原生 JS 模块化（无框架）：
- `api.js` — fetch 封装（POST/GET/SSE 流）
- `app.js` — 主控逻辑
- `article.js` — 文章渲染与交互
- `settings.js` — LLM 配置表单
- `popup.js` — 点击单词弹窗翻译
- `common-words.js` — 常见词过滤白名单

## 关键设计决策

- **非阻塞词汇加载**：文章生成后词汇和短语不阻塞返回，由前端通过 `/api/translate/vocabulary` 和 `/api/article/phrases` 异步加载，避免用户等待
- **LLM 配置**：不在服务端硬编码，运行时通过 settings 页面配置，存储在 `app.state.llm_config`（内存态）。`.env` 仅提供启动默认值
- **搜索降级**：web 搜索失败（无结果或抓取失败）时自动降级为纯 AI 生成，`fallback_reason` 字段提示前端展示
- **流式生成**：AI 模式支持 SSE（Server-Sent Events）流式输出，事件类型：`start` → `chunk` → `done` → `phrases`（后台异步）
- **代理支持**：所有外部 HTTP 请求（LLM API、Tavily、网页抓取）均通过 `PROXY_DICT` 配置走代理
