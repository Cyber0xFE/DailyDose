/**
 * 文章渲染与交互 — 渲染可点击文章、单词点击释义、短语选择、全文翻译。
 */
const Article = {
  _currentArticle: null,
  _translationsShown: false,
  _wordCache: {},
  _clickTimer: null,
  _clickDebounceMs: 300,
  _streamBuffer: '',
  _streamPara: null,

  init() {
    document.getElementById('btnFullTranslate').addEventListener('click', () => {
      this._handleFullTranslate();
    });
    document.getElementById('btnMarkPhrases').addEventListener('click', () => {
      this._handleMarkPhrases();
    });
  },

  /**
   * 流式渲染入口 — 接收 SSE 事件，渐进展示。
   */
  renderStream(event) {
    const contentEl = document.getElementById('articleContent');

    switch (event.event) {
      case 'start':
        this._currentArticle = { id: event.data.id, paragraphs: [] };
        this._wordCache = {};
        this._streamBuffer = '';
        this._streamPara = null;
        document.getElementById('emptyState').classList.add('hidden');
        document.getElementById('articleArea').classList.remove('hidden');
        document.getElementById('articleTitle').textContent = '...';
        document.getElementById('btnFullTranslate').textContent = '🌐 全文翻译';
        this._translationsShown = false;
        contentEl.replaceChildren();
        // 创建实时流式段落，逐字追加
        this._streamPara = document.createElement('p');
        this._streamPara.style.whiteSpace = 'pre-wrap';
        contentEl.appendChild(this._streamPara);
        break;

      case 'chunk':
        this._streamBuffer += event.data.text;
        this._streamPara.textContent = this._streamBuffer;
        break;

      case 'done':
        this._streamBuffer = '';
        this._streamPara = null;
        this.render(event.data);
        this._preloadAfterRender();
        break;

      case 'phrases':
        // 后台提取的短语到达，加载到缓存并重新渲染标记
        if (this._currentArticle && event.data.phrases) {
          event.data.phrases.forEach(p => {
            const key = p.text.toLowerCase().replace(/[^a-z\s']/g, '').trim();
            this._wordCache[key] = {
              definition: p.definition || '',
              part_of_speech: 'phrase',
              synonyms: [],
              example_sentence: '',
            };
          });
          this._currentArticle.phrases = event.data.phrases;
          this.render(this._currentArticle);
        }
        break;

      case 'error':
        App.showToast(event.data.message || '生成失败', 'error');
        break;
    }
  },

  /**
   * 渲染文章到页面（完整版本，含可点击单词）
   */
  render(articleData) {
    this._currentArticle = articleData;

    const titleEl = document.getElementById('articleTitle');
    const sourceBadge = document.getElementById('badgeSource');
    const diffBadge = document.getElementById('badgeDifficulty');
    const countBadge = document.getElementById('badgeWordCount');
    const contentEl = document.getElementById('articleContent');
    const articleArea = document.getElementById('articleArea');
    const emptyState = document.getElementById('emptyState');

    // 标题
    titleEl.textContent = articleData.title;

    // 元数据 badges
    sourceBadge.textContent = articleData.source === 'web' ? '🌐 网络文章' : '🤖 AI 生成';
    diffBadge.textContent = {
      beginner: '🟢 初级',
      intermediate: '🟡 中级',
      advanced: '🔴 高级',
    }[articleData.difficulty] || articleData.difficulty;
    countBadge.textContent = `📊 ${articleData.word_count} 词`;

    // 渲染段落，每个单词包裹为可点击 span（短语合并为单个 span）
    contentEl.replaceChildren();
    this._translationsShown = false;
    const btnTrans = document.getElementById('btnFullTranslate');
    btnTrans.textContent = '🌐 全文翻译';
    const btnPhrases = document.getElementById('btnMarkPhrases');
    btnPhrases.textContent = '🏷️ 标记短语';

    // 构建短语前缀匹配表
    const phraseMap = this._buildPhraseMap(articleData.phrases || []);

    articleData.paragraphs.forEach(para => {
      const p = document.createElement('p');
      const tokens = this._tokenize(para);
      // 提取纯单词序列用于短语匹配
      const wordTokens = tokens.filter(t => t.type === 'word');

      let wi = 0; // wordTokens 索引
      let ti = 0; // tokens 索引
      while (ti < tokens.length) {
        const token = tokens[ti];
        if (token.type !== 'word') {
          p.appendChild(document.createTextNode(token.text));
          ti++;
          continue;
        }

        // 尝试匹配短语
        const matched = this._matchPhrase(wordTokens, wi, phraseMap);
        if (matched) {
          const span = document.createElement('span');
          span.className = 'phrase';
          span.textContent = matched.text;
          span.dataset.word = matched.text;
          span.addEventListener('click', (e) => this._handleWordClick(e, span));
          p.appendChild(span);
          // 跳过短语包含的词
          const phraseWordCount = matched.text.split(/\s+/).length;
          wi += phraseWordCount;
          // 跳过对应的 tokens
          let skipped = 0;
          while (ti < tokens.length && skipped < phraseWordCount) {
            if (tokens[ti].type === 'word') skipped++;
            ti++;
          }
        } else {
          const span = document.createElement('span');
          span.className = 'clickable-word';
          span.textContent = token.text;
          span.dataset.word = token.text;
          span.addEventListener('click', (e) => this._handleWordClick(e, span));
          p.appendChild(span);
          wi++;
          ti++;
        }
      }
      contentEl.appendChild(p);
    });

    // 显示/隐藏区域
    articleArea.classList.remove('hidden');
    emptyState.classList.add('hidden');

    // 滚动到文章
    articleArea.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // 加载短语缓存
    if (articleData.phrases && articleData.phrases.length > 0) {
      articleData.phrases.forEach(p => {
        const key = p.text.toLowerCase().replace(/[^a-z\s']/g, '').trim();
        this._wordCache[key] = {
          definition: p.definition || '',
          part_of_speech: 'phrase',
          synonyms: [],
          example_sentence: '',
        };
      });
      console.log('[cache] 已加载 %d 个短语', articleData.phrases.length);
    }
  },

  /**
   * 渲染完成后调用：提取所有单词，批量翻译，写入缓存。
   */
  _preloadAfterRender() {
    const contentEl = document.getElementById('articleContent');
    if (!contentEl) return;

    // 从 DOM 中收集所有唯一单词（排除短词）
    const wordSet = new Set();
    contentEl.querySelectorAll('.clickable-word').forEach(el => {
      const text = el.dataset.word || el.textContent;
      const clean = text.toLowerCase().replace(/[^a-z']/g, '');
      if (clean.length >= 3) wordSet.add(text);
    });

    const words = Array.from(wordSet);
    if (words.length <= 2) return;

    console.log('[cache] 预加载全部 %d 个单词...', words.length);

    // 分批发送，每批最多 30 个
    const batchSize = 30;
    const batches = [];
    for (let i = 0; i < words.length; i += batchSize) {
      batches.push(words.slice(i, i + batchSize));
    }

    Promise.all(batches.map(batch =>
      API.preloadVocab(batch).then(res => {
        if (res.success && res.data && res.data.vocabulary) {
          res.data.vocabulary.forEach(item => {
            const key = item.word.toLowerCase().replace(/[^a-z']/g, '');
            if (!this._wordCache[key]) {
              this._wordCache[key] = {
                definition: item.definition || '',
                part_of_speech: item.part_of_speech || '',
                synonyms: item.synonyms || [],
                example_sentence: item.example_sentence || '',
              };
            }
          });
        }
      }).catch(err => console.error('[cache] 批次失败:', err))
    )).then(() => {
      console.log('[cache] 预加载完成，共 %d 条', Object.keys(this._wordCache).length);
    });
  },

  /**
   * 分词：将文本拆分为单词和分隔符
   */
  _tokenize(text) {
    const tokens = [];
    // 匹配英文单词（含缩写如 don't, it's）或非单词字符
    const regex = /\b[\w']+\b|[^\w\s]+|\s+/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const val = match[0];
      if (/^\s+$/.test(val)) {
        tokens.push({ type: 'space', text: val });
      } else if (/^[^\w\s]+$/.test(val)) {
        tokens.push({ type: 'punct', text: val });
      } else {
        tokens.push({ type: 'word', text: val });
      }
    }
    return tokens;
  },

  /**
   * 构建短语前缀匹配表：{firstWord: [{text, definition}, ...]}，按长度降序。
   */
  _buildPhraseMap(phrases) {
    const map = {};
    phrases.forEach(p => {
      const firstWord = p.text.split(/\s+/)[0].toLowerCase();
      if (!map[firstWord]) map[firstWord] = [];
      map[firstWord].push({ text: p.text, definition: p.definition || '' });
    });
    // 按短语长度降序排列（优先匹配更长的短语）
    for (const key in map) {
      map[key].sort((a, b) => b.text.split(/\s+/).length - a.text.split(/\s+/).length);
    }
    return map;
  },

  /**
   * 从 wordTokens[wi] 开始尝试匹配短语，返回最长匹配或 null。
   */
  _matchPhrase(wordTokens, wi, phraseMap) {
    const firstWord = wordTokens[wi].text.toLowerCase().replace(/[^a-z']/g, '');
    const candidates = phraseMap[firstWord];
    if (!candidates) return null;

    for (const candidate of candidates) {
      const phraseWords = candidate.text.split(/\s+/);
      if (wi + phraseWords.length > wordTokens.length) continue;

      let match = true;
      for (let j = 0; j < phraseWords.length; j++) {
        const tw = wordTokens[wi + j].text.toLowerCase().replace(/[^a-z']/g, '');
        const pw = phraseWords[j].toLowerCase().replace(/[^a-z']/g, '');
        if (tw !== pw) { match = false; break; }
      }
      if (match) return candidate;
    }
    return null;
  },

  /**
   * 单词点击处理（带防抖）
   */
  _handleWordClick(e, spanEl) {
    const word = spanEl.dataset.word;

    // 检查是否有文本选中（短语选择）
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      // 有选中文本，作为短语翻译
      const phrase = selection.toString().trim();
      if (phrase.split(/\s+/).length > 1) {
        this._translatePhrase(phrase, spanEl);
        return;
      }
    }

    // 防抖
    if (this._clickTimer) {
      clearTimeout(this._clickTimer);
    }
    this._clickTimer = setTimeout(() => {
      this._translateWord(word, spanEl);
    }, this._clickDebounceMs);
  },

  /**
   * 查询单个单词释义（缓存优先）
   */
  async _translateWord(word, spanEl) {
    // 移除之前的 active 状态
    document.querySelectorAll('.clickable-word.active').forEach(el => {
      el.classList.remove('active');
    });
    spanEl.classList.add('active');

    const key = word.toLowerCase().replace(/[^a-z']/g, '');

    // 缓存命中 → 直接显示
    if (this._wordCache[key]) {
      console.log('[cache] HIT  "%s"', word);
      Popup.show(word, this._wordCache[key], spanEl);
      return;
    }

    // 未命中 → 实时 API 查询
    console.log('[cache] MISS "%s" → 实时查询', word);
    const context = this._getContext(spanEl);
    Popup.showLoading(spanEl);

    try {
      const res = await API.translateWord(word, context);
      if (res.success && res.data) {
        this._wordCache[key] = res.data; // 也写入缓存
        Popup.show(word, res.data, spanEl);
      } else {
        Popup.showError(res.error || '查询失败');
      }
    } catch (err) {
      Popup.showError(err.message || '网络错误');
    }
  },

  /**
   * 短语翻译（选中文本）
   */
  async _translatePhrase(phrase, spanEl) {
    Popup.showLoading(spanEl);

    try {
      const res = await API.translateWord(phrase, '');
      if (res.success && res.data) {
        Popup.show(phrase, res.data, spanEl);
      } else {
        Popup.showError(res.error || '查询失败');
      }
    } catch (err) {
      Popup.showError(err.message || '网络错误');
    }
  },

  /**
   * 获取目标词的上下文
   */
  _getContext(spanEl) {
    const parent = spanEl.parentElement;
    if (!parent) return '';
    return parent.textContent || '';
  },

  /**
   * 标记短语 — 按钮触发，异步提取并重新渲染
   */
  async _handleMarkPhrases() {
    if (!this._currentArticle) return;
    // 已标记过则跳过
    if (this._currentArticle.phrases && this._currentArticle.phrases.length > 0) return;

    const btn = document.getElementById('btnMarkPhrases');
    btn.classList.add('loading');
    btn.textContent = '⏳ 提取中...';

    try {
      const res = await API.extractPhrases(this._currentArticle.paragraphs);
      if (res.success && res.data && res.data.phrases) {
        this._currentArticle.phrases = res.data.phrases;
        // 加载短语释义到缓存
        res.data.phrases.forEach(p => {
          const key = p.text.toLowerCase().replace(/[^a-z\s']/g, '').trim();
          this._wordCache[key] = {
            definition: p.definition || '',
            part_of_speech: 'phrase',
            synonyms: [],
            example_sentence: '',
          };
        });
        // 重新渲染以显示短语标记
        this.render(this._currentArticle);
        btn.textContent = '✅ 已标记';
      } else {
        App.showToast(res.error || '短语提取失败', 'error');
        btn.textContent = '🏷️ 标记短语';
      }
    } catch (err) {
      App.showToast('短语提取失败: ' + err.message, 'error');
      btn.textContent = '🏷️ 标记短语';
    } finally {
      btn.classList.remove('loading');
    }
  },

  /**
   * 全文翻译 — 逐段插入模式
   */
  async _handleFullTranslate() {
    if (!this._currentArticle) return;

    const btn = document.getElementById('btnFullTranslate');
    const contentEl = document.getElementById('articleContent');

    // 已显示 → 移除所有翻译段落
    if (this._translationsShown) {
      contentEl.querySelectorAll('.trans-para').forEach(el => el.remove());
      this._translationsShown = false;
      btn.textContent = '🌐 全文翻译';
      return;
    }

    btn.classList.add('loading');
    btn.textContent = '⏳ 翻译中...';

    const content = this._currentArticle.paragraphs.join('\n\n');

    try {
      const res = await API.translateFull(content, this._currentArticle.paragraphs);
      if (res.success && res.data) {
        this._insertTranslations(res.data);
        this._translationsShown = true;
        btn.textContent = '🙈 隐藏翻译';
      } else {
        App.showToast(res.error || '翻译失败', 'error');
      }
    } catch (err) {
      App.showToast('翻译失败: ' + err.message, 'error');
    } finally {
      btn.classList.remove('loading');
    }
  },

  /**
   * 将翻译逐段插入到对应英文段落后
   */
  _insertTranslations(data) {
    const contentEl = document.getElementById('articleContent');
    const paragraphs = contentEl.querySelectorAll('p:not(.trans-para)');
    const translations = data.paragraph_translations || [];

    if (translations.length > 0) {
      paragraphs.forEach((para, i) => {
        if (i < translations.length) {
          const transP = document.createElement('p');
          transP.className = 'trans-para';
          transP.textContent = translations[i];
          para.after(transP);
        }
      });
    } else if (data.translation) {
      // fallback：全文翻译插入到最后一段后
      const transP = document.createElement('p');
      transP.className = 'trans-para';
      transP.textContent = data.translation;
      const lastPara = paragraphs[paragraphs.length - 1];
      if (lastPara) lastPara.after(transP);
    }
  },

};
