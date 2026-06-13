# DailyDose — 英语学习平台

为中文母语者生成分级英语阅读文章，支持 AI 生成和网络搜索两种模式。

## 功能

- **AI 生成文章** — 流式输出（typewriter 效果），可选主题/难度/字数
- **网络搜索文章** — Tavily Search API 搜索真实英文内容，随机返回
- **点击查词** — 点击任意单词弹出中文释义、词性、同义词、例句
- **标记短语** — LLM 提取文章中的实用短语/搭配并高亮标注
- **全文翻译** — 逐段中英对照，缓存复用
- **生词本** — 右键菜单添加单词到生词本，支持发音朗读
- **历史记录** — SQLite 持久化，可回看历史文章
- **自由切换 LLM** — 设置面板配置任意 OpenAI 兼容 API，支持清除缓存测试不同模型

## 快速开始

```bash
# 安装依赖
pip install -r requirements.txt

# 配置环境变量（复制 .env 并填入你的 API Key）
# LLM_API_KEY=sk-xxx
# TAVILY_API_KEY=tvly-xxx

# 启动
python main.py
# 打开 http://127.0.0.1:8000
```

首次使用请在页面右上角 ⚙️ 设置中配置 LLM API（支持 OpenAI、DeepSeek 等兼容接口）。搜索模式需要 Tavily API Key（在 `.env` 中配置）。

## 技术栈

- **后端**：FastAPI + OpenAI SDK + SQLite（aiosqlite）
- **前端**：原生 HTML/CSS/JS，无框架
- **搜索**：Tavily Search API
- **流式输出**：Server-Sent Events（SSE）

## 项目结构

```
main.py              # FastAPI 入口
config.py            # 环境变量加载
models.py            # Pydantic v2 请求/响应模型
routes/
  article.py         # 文章生成（含 SSE 流式）
  translate.py       # 单词/词汇/全文翻译
  settings.py        # LLM 配置 CRUD
  history.py         # 历史记录 + 清除缓存
  vocab.py           # 生词本
services/
  article_generator.py  # 文章生成编排
  translator.py         # 翻译服务（prompt + JSON 解析）
  llm_client.py         # OpenAI SDK 封装
  web_scraper.py        # Tavily 搜索
  text_processor.py     # 文本清洗/段落分割
  history_db.py         # SQLite 持久层
static/
  index.html
  css/style.css
  js/
    api.js              # HTTP 请求封装
    app.js              # 主控逻辑
    article.js          # 文章渲染/交互/右键菜单
    popup.js            # 释义弹窗
    settings.js         # LLM 配置面板
    history.js          # 历史记录抽屉
    vocab-book.js       # 生词本抽屉
```
