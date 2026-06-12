/**
 * 释义弹窗组件 — 在单词附近显示中文释义。
 */
const Popup = {
  _elOverlay: null,
  _elCard: null,
  _elWord: null,
  _elPos: null,
  _elDefinition: null,
  _elSynonyms: null,
  _elExample: null,
  _elLoading: null,
  _elError: null,
  _elClose: null,
  _elBtnSpeak: null,
  _visible: false,
  _currentWord: '',
  _supported: 'speechSynthesis' in window,

  init() {
    this._elOverlay = document.getElementById('popupOverlay');
    this._elCard = document.getElementById('popupCard');
    this._elWord = document.getElementById('popupWord');
    this._elPos = document.getElementById('popupPos');
    this._elDefinition = document.getElementById('popupDefinition');
    this._elSynonyms = document.getElementById('popupSynonyms');
    this._elExample = document.getElementById('popupExample');
    this._elLoading = document.getElementById('popupLoading');
    this._elError = document.getElementById('popupError');
    this._elClose = document.getElementById('popupClose');
    this._elBtnSpeak = document.getElementById('btnSpeak');

    this._elClose.addEventListener('click', () => this.hide());
    this._elBtnSpeak.addEventListener('click', () => this._speak());
    this._elOverlay.addEventListener('click', (e) => {
      if (e.target === this._elOverlay) this.hide();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.hide();
    });
  },

  /**
   * 在指定位置显示释义弹窗
   */
  show(word, data, anchorEl) {
    this._currentWord = word;
    this._elWord.textContent = word;
    this._elPos.textContent = data.part_of_speech || '';
    this._elDefinition.textContent = data.definition || '';

    if (data.synonyms && data.synonyms.length > 0) {
      this._elSynonyms.textContent = '';
      const strong = document.createElement('strong');
      strong.textContent = '同义词：';
      this._elSynonyms.appendChild(strong);
      this._elSynonyms.appendChild(document.createTextNode(data.synonyms.join(', ')));
      this._elSynonyms.classList.remove('hidden');
    } else {
      this._elSynonyms.classList.add('hidden');
    }

    if (data.example_sentence) {
      this._elExample.textContent = `📝 ${data.example_sentence}`;
      this._elExample.classList.remove('hidden');
    } else {
      this._elExample.classList.add('hidden');
    }

    // 发音按钮（仅浏览器支持时显示）
    if (this._supported) {
      this._elBtnSpeak.classList.remove('hidden');
      this._elBtnSpeak.classList.remove('speaking');
    } else {
      this._elBtnSpeak.classList.add('hidden');
    }

    this._elLoading.classList.add('hidden');
    this._elError.classList.add('hidden');
    this._elOverlay.classList.remove('hidden');

    this._position(anchorEl);
    this._visible = true;
  },

  /**
   * 显示加载状态
   */
  showLoading(anchorEl) {
    this._currentWord = '';
    this._elWord.textContent = '';
    this._elPos.textContent = '';
    this._elDefinition.textContent = '';
    this._elSynonyms.classList.add('hidden');
    this._elExample.classList.add('hidden');
    this._elBtnSpeak.classList.add('hidden');
    this._elLoading.classList.remove('hidden');
    this._elError.classList.add('hidden');
    this._elOverlay.classList.remove('hidden');

    this._position(anchorEl);
    this._visible = true;
  },

  /**
   * 显示错误
   */
  showError(message) {
    this._elLoading.classList.add('hidden');
    this._elError.textContent = `⚠️ ${message}`;
    this._elError.classList.remove('hidden');
  },

  /**
   * 隐藏弹窗
   */
  hide() {
    this._elOverlay.classList.add('hidden');
    this._visible = false;

    // 移除所有单词和短语的 active 状态
    document.querySelectorAll('.clickable-word.active, .phrase.active').forEach(el => {
      el.classList.remove('active');
    });
  },

  /**
   * 定位弹窗 — 在目标元素附近，防止溢出视口
   */
  _position(anchorEl) {
    const card = this._elCard;
    const rect = anchorEl.getBoundingClientRect();
    const cardW = 320;
    const cardH = card.offsetHeight || 200;
    const gap = 8;
    const isMobile = window.innerWidth < 640;

    if (isMobile) {
      // 移动端：底部 Sheet 风格，由 CSS 处理
      card.style.top = '';
      card.style.bottom = '';
      card.style.left = '';
      card.style.right = '';
      return;
    }

    let top = rect.bottom + gap;
    let left = rect.left;

    // 垂直翻转
    if (top + cardH > window.innerHeight - 20) {
      top = rect.top - cardH - gap;
    }
    // 水平溢出
    if (left + cardW > window.innerWidth - 10) {
      left = window.innerWidth - cardW - 10;
    }
    if (left < 10) left = 10;
    // 确保不超出顶部
    if (top < 10) top = 10;

    card.style.top = top + 'px';
    card.style.left = left + 'px';
  },

  /**
   * 朗读当前单词（Web Speech API）
   */
  _speak() {
    if (!this._currentWord || !this._supported) return;

    // 取消之前的播放
    window.speechSynthesis.cancel();

    const utter = new SpeechSynthesisUtterance(this._currentWord);
    utter.lang = 'en-US';
    utter.rate = 0.85;

    const btn = this._elBtnSpeak;
    btn.classList.add('speaking');

    utter.onend = () => btn.classList.remove('speaking');
    utter.onerror = () => btn.classList.remove('speaking');

    window.speechSynthesis.speak(utter);
  },
};
