/**
 * 生词本面板 — 侧边抽屉 + 添加/查看/删除操作。
 */
const VocabBook = {
  _elDrawer: null,
  _elOverlay: null,
  _elList: null,
  _elEmpty: null,
  _elCount: null,
  _visible: false,
  _items: [],

  init() {
    this._elDrawer = document.getElementById('vocabDrawer');
    this._elOverlay = document.getElementById('vocabOverlay');
    this._elList = document.getElementById('vocabList');
    this._elEmpty = document.getElementById('vocabEmpty');
    this._elCount = document.getElementById('vocabCount');

    document.getElementById('btnVocabBook').addEventListener('click', () => this.toggle());
    document.getElementById('vocabClose').addEventListener('click', () => this.close());
    this._elOverlay.addEventListener('click', (e) => {
      if (e.target === this._elOverlay) this.close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._visible) this.close();
    });
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
      const res = await API.getVocab();
      if (res.success && res.data) {
        this._items = res.data;
        this._render();
      }
    } catch (err) {
      console.error('[vocab] load failed:', err);
    }
  },

  _render() {
    this._elList.innerHTML = '';
    this._elCount.textContent = this._items.length + '词';

    if (this._items.length === 0) {
      this._elEmpty.classList.remove('hidden');
      this._elList.classList.add('hidden');
      return;
    }

    this._elEmpty.classList.add('hidden');
    this._elList.classList.remove('hidden');

    this._items.forEach(item => {
      const li = document.createElement('li');
      li.className = 'vocab-item';
      li.dataset.id = item.id;
      li.innerHTML =
        '<div class="vocab-item-main">'
        + '<span class="vocab-word">' + this._escapeHtml(item.word) + '</span>'
        + '<button class="vocab-speak" title="发音">🔊</button>'
        + (item.part_of_speech ? '<span class="vocab-pos">' + this._escapeHtml(item.part_of_speech) + '</span>' : '')
        + '<span class="vocab-definition">' + this._escapeHtml(item.definition) + '</span>'
        + (item.source_article_title
          ? '<span class="vocab-meta">来自：' + this._escapeHtml(item.source_article_title) + ' · ' + this._formatDate(item.created_at) + '</span>'
          : '<span class="vocab-meta">' + this._formatDate(item.created_at) + '</span>')
        + '</div>'
        + '<button class="vocab-delete" title="删除">×</button>';

      li.querySelector('.vocab-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        this._deleteItem(item.id, li);
      });

      li.querySelector('.vocab-speak').addEventListener('click', (e) => {
        e.stopPropagation();
        this._speak(item.word);
      });

      this._elList.appendChild(li);
    });
  },

  async addWord(word, definition, partOfSpeech) {
    const payload = {
      word: word,
      definition: definition || '',
      part_of_speech: partOfSpeech || '',
      source_article_title: (Article._currentArticle && Article._currentArticle.title) || '',
      source_article_id: (Article._currentArticle && Article._currentArticle.id) || '',
    };
    try {
      const res = await API.addVocab(payload);
      if (res && res.success) {
        App.showToast('"' + word + '"已添加到生词本', 'success');
      } else {
        App.showToast((res && res.error) || '添加失败', 'error');
      }
    } catch (err) {
      App.showToast('添加失败: ' + err.message, 'error');
    }
  },

  async _deleteItem(id, liEl) {
    try {
      const res = await API.deleteVocab(id);
      if (res.success) {
        liEl.remove();
        this._items = this._items.filter(i => i.id !== id);
        this._elCount.textContent = this._items.length + '词';
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

  _formatDate(iso) {
    if (!iso) return '';
    return iso.replace('T', ' ').substring(0, 16);
  },

  _escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  },

  _speak(word) {
    if (!window.speechSynthesis) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(word);
    u.lang = 'en-US';
    u.rate = 0.85;
    speechSynthesis.speak(u);
  },
};
