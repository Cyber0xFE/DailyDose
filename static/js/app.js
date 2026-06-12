/**
 * 应用主控 — 全局状态管理、初始化、事件绑定。
 */
const App = {
  _state: {
    isConfigured: false,
    isLoading: false,
    currentMode: 'ai',
  },

  async init() {
    // 初始化子模块
    Popup.init();
    Article.init();
    Settings.init();

    // 绑定 UI 事件
    this._bindEvents();

    // 检查 LLM 配置状态
    await this._checkConfig();
  },

  _bindEvents() {
    // Tab 切换
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this._state.currentMode = tab.dataset.mode;
      });
    });

    // 生成按钮
    document.getElementById('btnGenerate').addEventListener('click', () => {
      this._generateArticle();
    });

    // 也支持点击"未配置"提示
    document.getElementById('hintNotConfigured').addEventListener('click', () => {
      if (!this._state.isConfigured) {
        Settings.open();
      }
    });
  },

  /**
   * 检查 LLM 配置状态
   */
  async _checkConfig() {
    try {
      const res = await API.getLLMConfig();
      if (res.success && res.data && res.data.is_configured) {
        this.onLLMConfigured(true);
      } else {
        this.onLLMConfigured(false);
      }
    } catch (err) {
      this.onLLMConfigured(false);
    }
  },

  /**
   * LLM 配置状态变更
   */
  onLLMConfigured(configured) {
    this._state.isConfigured = configured;
    const btn = document.getElementById('btnGenerate');
    const hint = document.getElementById('hintNotConfigured');

    if (configured) {
      btn.disabled = false;
      hint.classList.add('hidden');
    } else {
      btn.disabled = true;
      hint.classList.remove('hidden');
    }
  },

  /**
   * 生成文章
   */
  async _generateArticle() {
    if (!this._state.isConfigured || this._state.isLoading) return;

    this._state.isLoading = true;
    const btn = document.getElementById('btnGenerate');
    const loadingArea = document.getElementById('loadingArea');
    const loadingText = document.getElementById('loadingText');

    btn.disabled = true;
    loadingArea.classList.remove('hidden');

    const mode = this._state.currentMode;
    const params = {
      mode: mode,
      topic: document.getElementById('selTopic').value,
      difficulty: document.getElementById('selDifficulty').value,
      word_count: parseInt(document.getElementById('selWordCount').value),
    };

    if (mode === 'ai') {
      loadingText.textContent = '🤖 AI 正在生成文章...';
    } else {
      loadingText.textContent = '🔍 正在搜索相关文章...';
    }

    try {
      const res = await API.generateArticle(params);
      if (res.success && res.data) {
        Article._phrasesCache = null;
        Article.render(res.data);
        Article._preloadAfterRender();
      } else {
        this.showToast(res.error || '生成失败，请重试', 'error');
      }
    } catch (err) {
      this.showToast('生成失败: ' + err.message, 'error');
    } finally {
      this._state.isLoading = false;
      btn.disabled = !this._state.isConfigured;
      loadingArea.classList.add('hidden');
    }
  },

  /**
   * 显示 Toast 通知
   */
  showToast(message, type = 'error') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    // 3 秒后自动消失
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity .3s';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },
};

// ─── 启动应用 ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
