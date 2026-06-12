/**
 * API 调用封装 — 所有与后端的 HTTP 通信。
 */
const API = {
  /**
   * 通用 POST 请求
   */
  async post(url, body) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }
    return response.json();
  },

  /**
   * 通用 GET 请求
   */
  async get(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  },

  /**
   * 流式生成文章（AI 模式），返回 abort 函数 + promise。
   * onEvent: ({event, data}) => void
   */
  generateArticleStream(params, onEvent) {
    const controller = new AbortController();

    const run = (async () => {
      const resp = await fetch('/api/article/generate-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const text = await resp.text();
        onEvent({ event: 'error', data: { message: `HTTP ${resp.status}: ${text}` } });
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          let currentEvent = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                onEvent({ event: currentEvent, data });
              } catch (e) {
                // skip malformed JSON
              }
              currentEvent = '';
            }
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          onEvent({ event: 'error', data: { message: err.message } });
        }
      }
    })();

    return { abort: () => controller.abort() };
  },

  /**
   * 生成文章（非流式）
   */
  async generateArticle(params) {
    return this.post('/api/article/generate', params);
  },

  /**
   * 翻译单词/短语
   */
  async translateWord(word, context) {
    return this.post('/api/translate/word', { word, context });
  },

  /**
   * 批量预加载生词释义
   */
  async preloadVocab(words) {
    return this.post('/api/translate/vocabulary', { words });
  },

  /**
   * 提取短语（按钮触发）
   */
  async extractPhrases(paragraphs) {
    return this.post('/api/article/phrases', { paragraphs });
  },

  /**
   * 全文翻译
   */
  async translateFull(content, paragraphs) {
    return this.post('/api/translate/full', { content, paragraphs });
  },

  /**
   * 获取 LLM 配置
   */
  async getLLMConfig() {
    return this.get('/api/settings/llm');
  },

  /**
   * 保存 LLM 配置
   */
  async saveLLMConfig(config) {
    return this.post('/api/settings/llm', config);
  },

  /**
   * 测试 LLM 连接
   */
  async testLLMConnection(config) {
    return this.post('/api/settings/llm/test', config);
  },

  // ─── 历史记录 ─────────────────────────────

  async getHistory() {
    return this.get('/api/history');
  },

  async getHistoryDetail(id) {
    return this.get(`/api/history/${id}`);
  },

  async saveHistory(payload) {
    return this.post('/api/history', payload);
  },

  async deleteHistoryItem(id) {
    const response = await fetch(`/api/history/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  },

  async clearHistory() {
    const response = await fetch('/api/history', { method: 'DELETE' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  },
};
