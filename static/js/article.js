/**
 * 文章渲染与交互 — 渲染可点击文章、单词点击释义、短语选择、全文翻译。
 */
const Article = {
  _currentArticle: null,
  _translationsShown: false,
  _wordCache: {},
  _phrasesCache: null,  // 缓存短语提取结果，避免重复请求
  _translationCache: null,  // 缓存全文翻译结果
  _clickTimer: null,
  _clickDebounceMs: 300,
  _saveTimer: null,
  _contextMenu: null,
  _streamBuffer: '',
  _streamPara: null,

  init() {
    document.getElementById('btnFullTranslate').addEventListener('click', () => {
      this._handleFullTranslate();
    });
    document.getElementById('btnMarkPhrases').addEventListener('click', () => {
      this._handleMarkPhrases();
    });

    // 右键上下文菜单 — 事件委托
    document.getElementById('articleTitle').addEventListener('contextmenu', (e) => {
      this._handleContextMenu(e);
    });
    document.getElementById('articleContent').addEventListener('contextmenu', (e) => {
      this._handleContextMenu(e);
    });
    document.addEventListener('click', (e) => {
      if (this._contextMenu && !this._contextMenu.contains(e.target)) {
        this._closeContextMenu();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this._closeContextMenu();
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
        this._phrasesCache = null;
        this._translationCache = null;
        this._streamBuffer = '';
        this._streamPara = null;
        document.getElementById('emptyState').classList.add('hidden');
        document.getElementById('loadingArea').classList.add('hidden');
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

    // 清除旧文章的翻译残留（含标题翻译在 header 中的 .trans-para）
    document.querySelectorAll('.trans-para').forEach(el => el.remove());

    // 元数据 badges
    if (articleData.source === 'web' && articleData.source_url) {
      try {
        const url = new URL(articleData.source_url);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          throw new Error('unsafe protocol');
        }
        const domain = url.hostname;
        sourceBadge.textContent = '';
        const link = document.createElement('a');
        link.href = url.href;
        link.target = '_blank';
        link.rel = 'noopener';
        link.title = url.href;
        link.textContent = `来源：${domain}`;
        sourceBadge.appendChild(document.createTextNode('🌐 '));
        sourceBadge.appendChild(link);
      } catch {
        sourceBadge.textContent = '🌐 网络文章';
      }
    } else {
      sourceBadge.textContent = '🤖 AI 生成';
    }
    diffBadge.textContent = {
      beginner: '🟢 初级',
      intermediate: '🟡 中级',
      advanced: '🔴 高级',
    }[articleData.difficulty] || articleData.difficulty;
    countBadge.textContent = `📊 ${articleData.word_count} 词`;

    // 构建短语前缀匹配表
    const phraseMap = this._buildPhraseMap(articleData.phrases || []);

    // 标题 — 也渲染为可点击单词
    titleEl.replaceChildren();
    this._renderClickableText(titleEl, articleData.title, phraseMap);

    // 渲染段落，每个单词包裹为可点击 span（短语合并为单个 span）
    contentEl.replaceChildren();
    this._translationsShown = false;
    const btnTrans = document.getElementById('btnFullTranslate');
    btnTrans.textContent = '🌐 全文翻译';
    const btnPhrases = document.getElementById('btnMarkPhrases');
    btnPhrases.textContent = '🏷️ 标记短语';

    articleData.paragraphs.forEach(para => {
      const p = document.createElement('p');
      this._renderClickableText(p, para, phraseMap);
      contentEl.appendChild(p);
    });

    // 显示/隐藏区域
    articleArea.classList.remove('hidden');
    emptyState.classList.add('hidden');

    // 滚动到文章
    articleArea.scrollIntoView({ behavior: 'smooth', block: 'start' });

    this._scheduleSave();

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

    // 从 DOM 中收集所有唯一单词（标题 + 正文，排除短词）
    const wordSet = new Set();
    document.querySelectorAll('#articleTitle .clickable-word, #articleContent .clickable-word').forEach(el => {
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
      this._scheduleSave();
    });
  },

  /**
   * 将文本渲染为可点击单词和短语 span，追加到 parentEl 中。
   */
  _renderClickableText(parentEl, text, phraseMap) {
    const tokens = this._tokenize(text);
    const wordTokens = tokens.filter(t => t.type === 'word');

    let wi = 0;
    let ti = 0;
    while (ti < tokens.length) {
      const token = tokens[ti];
      if (token.type !== 'word') {
        parentEl.appendChild(document.createTextNode(token.text));
        ti++;
        continue;
      }

      const matched = this._matchPhrase(wordTokens, wi, phraseMap);
      if (matched) {
        const span = document.createElement('span');
        span.className = 'phrase';
        span.textContent = matched.text;
        span.dataset.word = matched.text;
        span.addEventListener('click', (e) => this._handleWordClick(e, span));
        parentEl.appendChild(span);
        const phraseWordCount = matched.text.split(/\s+/).length;
        wi += phraseWordCount;
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
        parentEl.appendChild(span);
        wi++;
        ti++;
      }
    }
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
   * 标记短语 — 按钮触发，点击标记/取消标记
   */
  async _handleMarkPhrases() {
    if (!this._currentArticle) return;

    const btn = document.getElementById('btnMarkPhrases');

    // 已标记 → 取消标记
    if (this._currentArticle.phrases && this._currentArticle.phrases.length > 0) {
      this._currentArticle.phrases = [];
      this.render(this._currentArticle);
      btn.textContent = '🏷️ 标记短语';
      return;
    }

    // 未标记 → 有缓存直接用，否则请求 LLM
    if (this._phrasesCache !== null) {
      if (this._phrasesCache.length > 0) {
        this._currentArticle.phrases = this._phrasesCache;
        this.render(this._currentArticle);
        btn.textContent = '✅ 已标记（点击取消）';
      } else {
        App.showToast('当前文章未检测到短语', 'info');
      }
      return;
    }

    btn.classList.add('loading');
    btn.textContent = '⏳ 提取中...';

    try {
      const res = await API.extractPhrases(this._currentArticle.paragraphs);
      if (res.success && res.data && res.data.phrases) {
        this._phrasesCache = res.data.phrases;
        if (this._phrasesCache.length > 0) {
          this._currentArticle.phrases = res.data.phrases;
          res.data.phrases.forEach(p => {
            const key = p.text.toLowerCase().replace(/[^a-z\s']/g, '').trim();
            this._wordCache[key] = {
              definition: p.definition || '',
              part_of_speech: 'phrase',
              synonyms: [],
              example_sentence: '',
            };
          });
          this.render(this._currentArticle);
          this._scheduleSave();
          btn.textContent = '✅ 已标记（点击取消）';
        } else {
          App.showToast('当前文章未检测到短语', 'info');
          btn.textContent = '🏷️ 标记短语';
        }
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

    // 已显示 → 移除所有翻译段落（含标题翻译）
    if (this._translationsShown) {
      document.querySelectorAll('.trans-para').forEach(el => el.remove());
      this._translationsShown = false;
      btn.textContent = '🌐 全文翻译';
      return;
    }

    // 有缓存 → 直接显示
    if (this._translationCache) {
      this._insertTranslations(this._translationCache);
      this._translationsShown = true;
      btn.textContent = '🙈 隐藏翻译';
      return;
    }

    btn.classList.add('loading');
    btn.textContent = '⏳ 翻译中...';

    // 标题 + 正文一起发送翻译
    const title = this._currentArticle.title;
    const allParagraphs = [title, ...this._currentArticle.paragraphs];
    const content = allParagraphs.join('\n\n');

    try {
      const res = await API.translateFull(content, allParagraphs);
      if (res.success && res.data) {
        this._translationCache = res.data;
        this._insertTranslations(res.data);
        this._translationsShown = true;
        btn.textContent = '🙈 隐藏翻译';
        this._scheduleSave();
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
    const translations = data.paragraph_translations || [];
    document.querySelectorAll('.trans-para').forEach(el => el.remove());

    // fallback：没有分段翻译时，用全文翻译插入到最后一段后
    if (translations.length === 0 && data.translation) {
      const lastPara = document.querySelector('#articleContent p:not(.trans-para):last-of-type');
      if (lastPara) {
        const transP = document.createElement('p');
        transP.className = 'trans-para';
        transP.textContent = data.translation;
        lastPara.insertAdjacentElement('afterend', transP);
      }
      return;
    }

    // 收集所有翻译目标元素：标题 h2 + 正文各段 p
    const targets = [];
    const titleEl = document.getElementById('articleTitle');
    if (titleEl) targets.push(titleEl);
    const contentEl = document.getElementById('articleContent');
    if (contentEl) {
      contentEl.querySelectorAll('p:not(.trans-para)').forEach(p => targets.push(p));
    }

    // 将翻译插入对应位置；多余翻译依次追加到上一条翻译后面
    let lastTransEl = null;
    for (let i = 0; i < translations.length; i++) {
      const transP = document.createElement('p');
      transP.className = 'trans-para';
      transP.textContent = translations[i];

      if (i < targets.length) {
        targets[i].insertAdjacentElement('afterend', transP);
      } else if (lastTransEl) {
        lastTransEl.insertAdjacentElement('afterend', transP);
      } else if (contentEl) {
        contentEl.appendChild(transP);
      }
      lastTransEl = transP;
    }
  },

  /**
   * 防抖保存到历史记录（2 秒延迟，多次调用会重置计时器）。
   */
  _scheduleSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      if (typeof History !== 'undefined') {
        History.saveCurrentArticle();
      }
    }, 2000);
  },

  /**
   * 右键上下文菜单。
   */
  _handleContextMenu(e) {
    const spanEl = e.target.closest('.clickable-word, .phrase');
    if (!spanEl) return;

    e.preventDefault();
    this._closeContextMenu();

    const word = spanEl.dataset.word;
    const key = word.toLowerCase().replace(/[^a-z']/g, '');

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.innerHTML =
      '<div class="context-menu-item" data-action="lookup">📖 查看释义</div>'
      + '<div class="context-menu-item" data-action="addVocab">📝 添加到生词本</div>';

    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    menu.querySelector('[data-action="lookup"]').addEventListener('click', () => {
      this._translateWord(word, spanEl);
      this._closeContextMenu();
    });

    menu.querySelector('[data-action="addVocab"]').addEventListener('click', async () => {
      const cached = this._wordCache[key];
      if (cached) {
        VocabBook.addWord(word, cached.definition, cached.part_of_speech);
      } else {
        // 缓存未命中，先查释义再添加
        const context = this._getContext(spanEl);
        try {
          const res = await API.translateWord(word, context);
          if (res.success && res.data) {
            this._wordCache[key] = res.data;
            VocabBook.addWord(word, res.data.definition, res.data.part_of_speech);
          } else {
            VocabBook.addWord(word, '', '');
          }
        } catch {
          VocabBook.addWord(word, '', '');
        }
      }
      this._closeContextMenu();
    });

    document.body.appendChild(menu);
    this._contextMenu = menu;

    // 防止菜单溢出视口
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth - 10) {
      menu.style.left = (e.clientX - rect.width) + 'px';
    }
    if (rect.bottom > window.innerHeight - 10) {
      menu.style.top = (e.clientY - rect.height) + 'px';
    }
  },

  _closeContextMenu() {
    if (this._contextMenu) {
      this._contextMenu.remove();
      this._contextMenu = null;
    }
  },

};
