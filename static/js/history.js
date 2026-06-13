/**
 * 历史记录面板 — 侧边抽屉 + 保存/加载/删除操作。
 */
const History = {
  _elDrawer: null,
  _elOverlay: null,
  _elList: null,
  _elEmpty: null,
  _elCount: null,
  _visible: false,
  _items: [],

  init() {
    this._elDrawer = document.getElementById('historyDrawer');
    this._elOverlay = document.getElementById('historyOverlay');
    this._elList = document.getElementById('historyList');
    this._elEmpty = document.getElementById('historyEmpty');
    this._elCount = document.getElementById('historyCount');

    document.getElementById('btnHistory').addEventListener('click', () => this.toggle());
    document.getElementById('historyClose').addEventListener('click', () => this.close());
    this._elOverlay.addEventListener('click', (e) => {
      if (e.target === this._elOverlay) this.close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._visible) this.close();
    });

    document.getElementById('btnClearHistory').addEventListener('click', () => this._clearAll());
  },

  async toggle() {
    if (this._visible) {
      this.close();
    } else {
      await this._load();
      this.open();
    }
  },

  open() {
    this._elDrawer.classList.add('open');
    this._elOverlay.classList.remove('hidden');
    this._visible = true;
  },

  close() {
    this._elDrawer.classList.remove('open');
    this._elOverlay.classList.add('hidden');
    this._visible = false;
  },

  async _load() {
    try {
      const res = await API.getHistory();
      if (res.success && res.data) {
        this._items = res.data;
        this._render();
      }
    } catch (err) {
      console.error('[history] load failed:', err);
    }
  },

  _render() {
    this._elList.innerHTML = '';
    this._elCount.textContent = this._items.length + '篇';

    if (this._items.length === 0) {
      this._elEmpty.classList.remove('hidden');
      this._elList.classList.add('hidden');
      return;
    }

    this._elEmpty.classList.add('hidden');
    this._elList.classList.remove('hidden');

    this._items.forEach(item => {
      const li = document.createElement('li');
      li.className = 'history-item';
      li.dataset.id = item.id;
      li.innerHTML =
        '<div class="history-item-main" data-action="load">'
        + '<span class="history-title">' + this._escapeHtml(item.title) + '</span>'
        + '<span class="history-meta">'
        + (item.source === 'web' ? '🌐' : '🤖')
        + ' ' + this._difficultyLabel(item.difficulty)
        + ' · ' + item.word_count + ' 词'
        + ' · ' + this._formatDate(item.created_at)
        + '</span>'
        + '</div>'
        + '<button class="history-delete" data-action="delete" title="删除">×</button>';

      li.querySelector('[data-action="load"]').addEventListener('click', () => {
        this._loadArticle(item.id);
      });

      li.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
        e.stopPropagation();
        this._deleteItem(item.id, li);
      });

      this._elList.appendChild(li);
    });
  },

  async _loadArticle(id) {
    try {
      const res = await API.getHistoryDetail(id);
      if (res.success && res.data) {
        const article = res.data.article;
        Article._wordCache = {};
        if (article.vocabulary) {
          article.vocabulary.forEach(v => {
            const key = v.word.toLowerCase().replace(/[^a-z']/g, '');
            Article._wordCache[key] = Object.assign({}, v);
          });
        }
        Article._phrasesCache = article.phrases || [];
        if (res.data.full_translation) {
          Article._translationCache = res.data.full_translation;
        } else {
          Article._translationCache = null;
        }

        Article._currentArticle = article;
        Article.render(article);
        this.close();
      } else {
        App.showToast(res.error || '加载失败', 'error');
      }
    } catch (err) {
      App.showToast('加载历史文章失败: ' + err.message, 'error');
    }
  },

  async _deleteItem(id, liEl) {
    try {
      const res = await API.deleteHistoryItem(id);
      if (res.success) {
        liEl.remove();
        this._items = this._items.filter(i => i.id !== id);
        this._elCount.textContent = this._items.length + '篇';
        if (this._items.length === 0) {
          this._render();
        }
      } else {
        App.showToast(res.error || '删除失败', 'error');
      }
    } catch (err) {
      App.showToast('删除失败: ' + err.message, 'error');
    }
  },

  async _clearAll() {
    if (this._items.length === 0) return;
    if (!confirm('确定要清空全部历史记录吗？')) return;

    try {
      const res = await API.clearHistory();
      if (res.success) {
        this._items = [];
        this._render();
        App.showToast('历史记录已清空', 'success');
      } else {
        App.showToast(res.error || '清空失败', 'error');
      }
    } catch (err) {
      App.showToast('清空失败: ' + err.message, 'error');
    }
  },

  async saveCurrentArticle() {
    if (!Article._currentArticle) return;

    // 从 _wordCache 构建词汇列表（_currentArticle.vocabulary 始终为空）
    const vocabList = Object.entries(Article._wordCache)
      .filter(([, v]) => v.part_of_speech !== 'phrase')
      .map(([word, v]) => ({
        word: word,
        definition: v.definition,
        part_of_speech: v.part_of_speech || '',
        synonyms: v.synonyms || [],
        example_sentence: v.example_sentence || '',
      }));
    const payload = {
      article: Article._currentArticle,
      vocabulary: vocabList.length > 0 ? vocabList : null,
      phrases: Article._phrasesCache !== null ? Article._phrasesCache : null,
      full_translation: Article._translationCache || null,
    };

    try {
      const res = await API.saveHistory(payload);
      if (res && res.success) {
        console.log('[history] saved:', Article._currentArticle.id);
      }
    } catch (err) {
      console.error('[history] save failed:', err);
    }
  },

  _difficultyLabel(d) {
    return {beginner: '🟢初级', intermediate: '🟡中级', advanced: '🔴高级'}[d] || d;
  },

  _formatDate(iso) {
    if (!iso) return '';
    return iso.replace('T', ' ').substring(0, 16);
  },

  _escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  },
};
