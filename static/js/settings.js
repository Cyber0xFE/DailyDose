/**
 * LLM 配置面板 — 设置模态框逻辑。
 */
const Settings = {
  init() {
    this._elOverlay = document.getElementById('settingsOverlay');
    this._elEndpoint = document.getElementById('cfgEndpoint');
    this._elApiKey = document.getElementById('cfgApiKey');
    this._elModel = document.getElementById('cfgModel');

    // 打开设置
    document.getElementById('btnSettings').addEventListener('click', () => this.open());
    // 关闭设置
    document.getElementById('settingsClose').addEventListener('click', () => this.close());
    this._elOverlay.addEventListener('click', (e) => {
      if (e.target === this._elOverlay) this.close();
    });

    // 保存
    document.getElementById('btnSaveSettings').addEventListener('click', () => this.save());
    // 测试连接
    document.getElementById('btnTestConnection').addEventListener('click', () => this.testConnection());
  },

  /**
   * 打开设置面板
   */
  async open() {
    this._elOverlay.classList.remove('hidden');

    // 加载已有配置
    try {
      const res = await API.getLLMConfig();
      if (res.success && res.data) {
        if (res.data.is_configured) {
          this._elEndpoint.value = res.data.endpoint || '';
          this._elApiKey.value = ''; // 不暴露完整 key
          this._elApiKey.placeholder = res.data.api_key_masked || 'sk-...';
          this._elModel.value = res.data.model_name || '';
        }
      }
    } catch (err) {
      // 静默失败
    }
  },

  /**
   * 关闭设置面板
   */
  close() {
    this._elOverlay.classList.add('hidden');
    document.getElementById('testResult').classList.add('hidden');
  },

  /**
   * 保存 LLM 配置
   */
  async save() {
    const endpoint = this._elEndpoint.value.trim();
    const apiKey = this._elApiKey.value.trim();
    const model = this._elModel.value.trim();

    // 验证
    if (!endpoint) {
      App.showToast('请输入 API Endpoint', 'error');
      return;
    }
    if (!apiKey && !this._elApiKey.placeholder.startsWith('sk-')) {
      App.showToast('请输入 API Key', 'error');
      return;
    }

    const saveKey = apiKey || ''; // 如果没填新 key，后端保留旧的

    try {
      const res = await API.saveLLMConfig({
        endpoint,
        api_key: saveKey,
        model_name: model || 'gpt-4o',
      });

      if (res.success) {
        App.showToast('配置已保存 ✅', 'success');
        App.onLLMConfigured(true);
        this.close();
      } else {
        App.showToast('保存失败: ' + (res.message || ''), 'error');
      }
    } catch (err) {
      App.showToast('保存失败: ' + err.message, 'error');
    }
  },

  /**
   * 测试 LLM 连接
   */
  async testConnection() {
    const resultDiv = document.getElementById('testResult');
    const btn = document.getElementById('btnTestConnection');

    const endpoint = this._elEndpoint.value.trim();
    const apiKey = this._elApiKey.value.trim();
    const model = this._elModel.value.trim();

    if (!endpoint || !apiKey) {
      App.showToast('请先填写 Endpoint 和 API Key', 'error');
      return;
    }

    btn.textContent = '⏳ 测试中...';
    btn.disabled = true;
    resultDiv.classList.add('hidden');

    try {
      const res = await API.testLLMConnection({
        endpoint,
        api_key: apiKey,
        model_name: model || 'gpt-4o',
      });

      resultDiv.classList.remove('hidden');
      if (res.success) {
        resultDiv.className = 'test-result success';
        resultDiv.innerHTML = `✅ ${res.message}<br>📊 模型: ${res.model_responded}<br>⏱️ 延迟: ${res.latency_ms}ms`;
      } else {
        resultDiv.className = 'test-result error';
        resultDiv.textContent = `❌ ${res.message}`;
      }
    } catch (err) {
      resultDiv.classList.remove('hidden');
      resultDiv.className = 'test-result error';
      resultDiv.textContent = `❌ 连接失败: ${err.message}`;
    } finally {
      btn.textContent = '🔌 测试连接';
      btn.disabled = false;
    }
  },
};
