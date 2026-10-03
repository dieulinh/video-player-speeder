(() => {
  // ── Re-entry guard ──────────────────────────────────────────────────────
  if (window.__speedPanelInitialized) {
    if (typeof window.__speedPanelToggle === 'function') window.__speedPanelToggle();
    return;
  }
  window.__speedPanelInitialized = true;

  // ── Utilities ────────────────────────────────────────────────────────────
  const escapeHtml = (str) => {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const formatTime = (seconds) => {
    if (typeof seconds !== 'number' || Number.isNaN(seconds) || seconds < 0) return '--:--';
    const total = Math.floor(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
    const ss = String(s).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm.padStart(2, '0')}:${ss}`;
  };

  // ── Storage with graceful context invalidation handling ──────────────────
  const isExtensionContextValid = () => {
    try {
      return !!(chrome?.storage?.local);
    } catch (e) {
      return false;
    }
  };

  const storageGet = (keys, cb) => {
    if (!isExtensionContextValid()) {
      if (typeof cb === 'function') cb({});
      return;
    }
    try {
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          console.warn('[Speed Control] Storage read error:', chrome.runtime.lastError.message);
          if (typeof cb === 'function') cb({});
          return;
        }
        if (typeof cb === 'function') cb(result || {});
      });
    } catch (e) {
      console.warn('[Speed Control] Storage error:', e.message || e);
      if (typeof cb === 'function') cb({});
    }
  };

  const storageSet = (values) => {
    if (!isExtensionContextValid()) return;
    if (!values || typeof values !== 'object') return;
    
    try {
      chrome.storage.local.set(values, () => {
        if (chrome.runtime.lastError) {
          console.warn('[Speed Control] Storage write error:', chrome.runtime.lastError.message);
        }
      });
    } catch (e) {
      console.warn('[Speed Control] Storage error:', e.message || e);
    }
  };
  

  // ── Video helpers ────────────────────────────────────────────────────────
  // SIMPLIFIED: Find main document videos + YouTube shadow DOM only
  const getAllVideos = () => {
    const videos = [...document.querySelectorAll('video')];
    
    // Only check YouTube player (most common shadow DOM video source)
    try {
      const ytPlayer = document.querySelector('div.html5-video-container')?.parentElement;
      if (ytPlayer?.shadowRoot) {
        const shadowVideos = ytPlayer.shadowRoot.querySelectorAll('video');
        for (let i = 0; i < shadowVideos.length; i++) {
          if (!videos.includes(shadowVideos[i])) videos.push(shadowVideos[i]);
        }
      }
    } catch (e) {}
    
    return videos;
  };

  const getActiveVideo = (videos) => {
    const playing = videos.find(v => !v.paused && !Number.isNaN(v.currentTime));
    const visible = videos.find(v => {
      try { const r = v.getBoundingClientRect(); return r.width > 0 && r.height > 0; } catch (_) { return false; }
    });
    return playing || visible || videos.find(v => !Number.isNaN(v.currentTime)) || videos[0] || null;
  };

  const buildSummary = (videos) => {
    const s = { found: false, speed: 1, currentTime: 0, duration: null, playing: false, title: document.title || '' };
    const v = getActiveVideo(videos);
    if (v) {
      s.found = true;
      s.speed = v.playbackRate || 1;
      s.currentTime = v.currentTime || 0;
      s.duration = Number.isFinite(v.duration) ? v.duration : null;
      s.playing = !v.paused;
    }
    return s;
  };

  // ── Shadow DOM CSS ───────────────────────────────────────────────────────
  const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .panel {
    width: 265px;
    background: rgba(255,255,255,0.97);
    border-radius: 16px;
    border: 1px solid rgba(15,23,42,0.08);
    box-shadow: 0 16px 38px rgba(15,23,42,0.20), 0 4px 12px rgba(0,0,0,0.06);
    backdrop-filter: blur(14px);
    font-family: Arial, sans-serif;
    font-size: 13px;
    line-height: 1.4;
    color: #111827;
    overflow: hidden;
    pointer-events: auto;
    --accent: #2563eb; --accent-strong: #1d4ed8;
    --success: #22c55e; --success-strong: #16a34a;
    --text-strong: #111827; --text-main: #374151; --text-muted: #6b7280;
    --icon-surface: #f3f4f6; --icon-surface-hover: #e5e7eb;
    --border: rgba(15,23,42,0.08); --status-bg: rgba(248,250,252,0.9);
  }
  .panel.theme-dim {
    background: rgba(18,27,47,0.97); color: #cbd5e1;
    border-color: rgba(255,255,255,0.08); box-shadow: 0 18px 44px rgba(0,0,0,0.55);
    --accent: #38bdf8; --accent-strong: #0ea5e9;
    --text-strong: #e2e8f0; --text-main: #cbd5e1; --text-muted: #94a3b8;
    --icon-surface: #111827; --icon-surface-hover: #0b1220;
    --border: rgba(255,255,255,0.08); --status-bg: rgba(15,23,42,0.85);
  }
  .panel.theme-night {
    background: rgba(7,11,22,0.97); color: #d1d5db;
    border-color: rgba(255,255,255,0.06); box-shadow: 0 20px 48px rgba(0,0,0,0.6);
    --accent: #7c3aed; --accent-strong: #6d28d9;
    --text-strong: #e5e7eb; --text-main: #d1d5db; --text-muted: #9ca3af;
    --icon-surface: #0b1220; --icon-surface-hover: #111827;
    --border: rgba(255,255,255,0.06); --status-bg: rgba(11,17,29,0.90);
  }
  .panel.theme-movie {
    background: rgba(10,13,24,0.97); color: #e2e8f0;
    border-color: rgba(255,255,255,0.08); box-shadow: 0 22px 52px rgba(0,0,0,0.58);
    --accent: #f59e0b; --accent-strong: #d97706;
    --text-strong: #f8fafc; --text-main: #e2e8f0; --text-muted: #a3b0c0;
    --icon-surface: #0f172a; --icon-surface-hover: #111827;
    --border: rgba(255,255,255,0.08); --status-bg: rgba(15,23,42,0.88);
  }
  .panel.theme-reading {
    background: rgba(255,253,248,0.98); color: #3f352a;
    border-color: rgba(60,48,31,0.12); box-shadow: 0 16px 36px rgba(68,52,31,0.22);
    --accent: #d97706; --accent-strong: #b45309;
    --text-strong: #2f2a1f; --text-main: #3f352a; --text-muted: #7a6a55;
    --icon-surface: #f2e8d5; --icon-surface-hover: #e9dec7;
    --border: rgba(60,48,31,0.12); --status-bg: rgba(255,253,248,0.90);
  }
  .panel.theme-focus {
    background: rgba(11,19,28,0.98); color: #c8e0f5;
    border-color: rgba(255,255,255,0.07); box-shadow: 0 20px 48px rgba(0,0,0,0.58);
    --accent: #10b981; --accent-strong: #0f9f75;
    --text-strong: #e5f4ff; --text-main: #c8e0f5; --text-muted: #8ba6c0;
    --icon-surface: #0f172a; --icon-surface-hover: #0c1422;
    --border: rgba(255,255,255,0.07); --status-bg: rgba(10,18,30,0.88);
  }

  /* Header */
  .panel-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 12px 10px 14px;
    border-bottom: 1px solid var(--border);
    cursor: grab;
  }
  .panel-header:active { cursor: grabbing; }
  .panel-title { font-size: 13px; font-weight: 700; color: var(--text-strong); }
  .header-btns { display: flex; gap: 5px; }
  .icon-btn {
    width: 24px; height: 24px;
    border: 1px solid var(--border); border-radius: 6px;
    background: var(--icon-surface); color: var(--text-strong);
    font-size: 15px; line-height: 1; display: flex; align-items: center; justify-content: center;
    cursor: pointer; padding: 0; transition: background 0.15s;
  }
  .icon-btn:hover { background: var(--icon-surface-hover); }

  /* Body */
  .panel-body {
    padding: 10px 12px;
    display: flex; flex-direction: column; gap: 10px;
    max-height: calc(100vh - 120px);
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
  }
  .panel-body::-webkit-scrollbar { width: 3px; }
  .panel-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
  .panel.collapsed .panel-body { display: none; }

  .section-label {
    font-size: 10px; font-weight: 700; color: var(--text-muted);
    text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 5px;
  }

  /* Theme buttons */
  .theme-options { display: flex; flex-wrap: wrap; gap: 4px; }
  .theme-btn {
    padding: 5px 9px; border-radius: 999px;
    border: 1px solid var(--border); background: var(--icon-surface);
    color: var(--text-main); font-size: 11px; font-weight: 700;
    cursor: pointer; transition: background 0.15s, color 0.15s;
  }
  .theme-btn:hover { background: var(--icon-surface-hover); }
  .theme-btn.active {
    background: linear-gradient(135deg, var(--accent), var(--accent-strong));
    color: #fff; border-color: transparent;
  }

  /* Speed grid */
  .speed-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
  .speed-btn {
    padding: 7px 2px; font-size: 11px; font-weight: 700;
    background: linear-gradient(135deg, var(--success), var(--success-strong));
    color: #fff; border: none; border-radius: 7px;
    cursor: pointer; transition: transform 0.1s, opacity 0.1s;
  }
  .speed-btn:hover { transform: translateY(-1px); opacity: 0.9; }
  .speed-btn:active { transform: translateY(0); }
  .speed-btn.active {
    background: linear-gradient(135deg, var(--accent), var(--accent-strong));
  }

  /* Reset button */
  .reset-btn {
    width: 100%; padding: 12px 10px; margin-top: 8px; font-size: 14px; font-weight: 700;
    background: linear-gradient(135deg, #ef4444, #dc2626);
    color: #fff; border: none; border-radius: 9px;
    cursor: pointer; transition: transform 0.1s, opacity 0.1s, box-shadow 0.1s;
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
  }
  .reset-btn:hover { transform: translateY(-2px); opacity: 0.9; box-shadow: 0 6px 16px rgba(239, 68, 68, 0.4); }
  .reset-btn:active { transform: translateY(0); }

  /* Clock */
  .clock {
    text-align: center; font-size: 20px; font-weight: 700; color: var(--text-strong);
    padding: 7px 10px; border-radius: 9px;
    border: 1px solid var(--border); background: var(--status-bg);
  }

  /* Action buttons */
  .action-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
  .control-btn {
    padding: 8px 4px; font-size: 11px; font-weight: 600;
    border: none; border-radius: 999px; cursor: pointer; color: #fff;
    transition: opacity 0.15s, transform 0.1s; white-space: nowrap;
  }
  .control-btn:hover { opacity: 0.88; transform: translateY(-1px); }
  .control-btn:active { transform: translateY(0); }
  .control-btn.orange { background: linear-gradient(135deg, #f97316, #ea580c); }
  .control-btn.blue   { background: linear-gradient(135deg, #0ea5e9, #2563eb); }
  .control-btn.full   { grid-column: 1 / -1; }

  /* Loop row */
  .loop-row { display: flex; align-items: center; gap: 8px; }
  .loop-toggle {
    display: inline-flex; align-items: center; gap: 7px;
    cursor: pointer; font-size: 11px; color: var(--text-main); flex-shrink: 0;
  }
  .loop-toggle input { display: none; }
  .loop-slider {
    width: 34px; height: 18px; border-radius: 999px; background: #d1d5db;
    position: relative; transition: background 0.2s; flex-shrink: 0;
  }
  .loop-slider::after {
    content: ''; position: absolute;
    width: 12px; height: 12px; border-radius: 50%; background: #fff;
    top: 3px; left: 3px; transition: transform 0.2s;
    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  }
  .loop-toggle input:checked + .loop-slider {
    background: linear-gradient(135deg, var(--accent), var(--accent-strong));
  }
  .loop-toggle input:checked + .loop-slider::after { transform: translateX(16px); }
  .loop-status {
    flex: 1; text-align: center; font-size: 11px; color: var(--text-muted);
    padding: 4px 6px; border-radius: 8px; border: 1px dashed var(--border);
    background: var(--status-bg); min-height: 26px;
    display: flex; align-items: center; justify-content: center;
  }

  /* Status boxes */
  .status-box {
    font-size: 11px; line-height: 1.5; color: var(--text-main);
    padding: 7px 10px; border-radius: 9px;
    border: 1px solid var(--border); background: var(--status-bg); min-height: 32px;
  }
  .status-box strong { color: var(--accent); }
  .status-box.dashed {
    border-style: dashed; text-align: center; color: var(--text-muted);
  }
  .status-box .video-title {
    margin-top: 5px; font-size: 10px; font-style: italic; color: var(--text-muted);
  }
  `;

  // ── Shadow DOM HTML ───────────────────────────────────────────────────────
  const HTML = `
  <div class="panel" id="panel">
    <div class="panel-header" id="panelHeader">
      <span class="panel-title">Speed Control</span>
      <div class="header-btns">
        <button class="icon-btn" id="collapseBtn" title="Collapse">−</button>
        <button class="icon-btn" id="closeBtn" title="Close">×</button>
      </div>
    </div>
    <div class="panel-body">
      <div>
        <div class="section-label">Screen mode</div>
        <div class="theme-options">
          <button class="theme-btn" data-theme="light">Day</button>
          <button class="theme-btn" data-theme="dim">Dim</button>
          <button class="theme-btn" data-theme="night">Night</button>
          <button class="theme-btn" data-theme="movie">Movie</button>
          <button class="theme-btn" data-theme="reading">Reading</button>
          <button class="theme-btn" data-theme="focus">Focus</button>
        </div>
      </div>
      <div>
        <div class="section-label">Playback speed</div>
        <div class="speed-grid">
          <button class="speed-btn" data-speed="1">1</button>
          <button class="speed-btn" data-speed="1.1">1.1</button>
          <button class="speed-btn" data-speed="1.15">1.15</button>
          <button class="speed-btn" data-speed="1.2">1.2</button>
          <button class="speed-btn" data-speed="1.25">1.25</button>
          <button class="speed-btn" data-speed="1.3">1.3</button>
          <button class="speed-btn" data-speed="1.35">1.35</button>
          <button class="speed-btn" data-speed="1.4">1.4</button>
          <button class="speed-btn" data-speed="1.45">1.45</button>
          <button class="speed-btn" data-speed="1.5">1.5</button>
          <button class="speed-btn" data-speed="1.55">1.55</button>
          <button class="speed-btn" data-speed="1.6">1.6</button>
          <button class="speed-btn" data-speed="1.65">1.65</button>
          <button class="speed-btn" data-speed="1.75">1.75</button>
          <button class="speed-btn" data-speed="1.85">1.85</button>
          <button class="speed-btn" data-speed="1.95">1.95</button>
          <button class="speed-btn" data-speed="2">2</button>
          <button class="speed-btn" data-speed="2.25">2.25</button>
          <button class="speed-btn" data-speed="2.5">2.5</button>
          <button class="speed-btn" data-speed="2.75">2.75</button>
          <button class="speed-btn" data-speed="3">3</button>
          <button class="speed-btn" data-speed="3.25">3.25</button>
          <button class="speed-btn" data-speed="3.5">3.5</button>
          <button class="speed-btn" data-speed="4">4</button>
          <button class="speed-btn" data-speed="5">5</button>
          <button class="speed-btn" data-speed="15">15</button>
          <button class="speed-btn" data-speed="16">16</button>
        </div>
        <button class="reset-btn" id="resetBtn" title="Reset speed to 1x">🔄 Reset to Normal</button>
      </div>
      <div class="clock" id="clockDisplay">00:00:00</div>
      <div class="status-box dashed" id="speedTimer">Speed timer: --</div>
      <div class="action-grid">
        <button class="control-btn orange" id="skipAdBtn">Skip Ad</button>
        <button class="control-btn blue"   id="rewindBtn">← 1 min</button>
        <button class="control-btn blue"   id="forwardBtn">1 min →</button>
        <button class="control-btn orange full" id="openVideoBtn">Open Video in Tab</button>
      </div>
      <div class="loop-row">
        <label class="loop-toggle">
          <input type="checkbox" id="loopToggle">
          <span class="loop-slider"></span>
          <span>Loop</span>
        </label>
        <div class="loop-status" id="loopStatus">Loop: Off</div>
      </div>
      <div class="status-box" id="videoStatus">No video info yet. Pick a speed.</div>
      <div class="status-box dashed" id="adStatus">Ad status: Waiting.</div>
      <div class="status-box dashed" id="rewindStatus">Rewind status: Waiting.</div>
    </div>
  </div>
  `;

  // ── Panel state ───────────────────────────────────────────────────────────
  let host = null;
  let shadow = null;
  let isVisible = false;
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  const THEMES = ['light', 'dim', 'night', 'movie', 'reading', 'focus'];

  // ── Positioning ───────────────────────────────────────────────────────────
  const positionPanel = () => {
    if (!host) return;
    const PANEL_W = 265;
    const MARGIN = 12;

    // Always position at the most right edge of the browser
    const left = window.innerWidth - PANEL_W - MARGIN;
    const top = Math.max(MARGIN, Math.round((window.innerHeight - 460) / 2));

    host.style.left = `${left}px`;
    host.style.top  = `${top}px`;
  };

  // ── Create panel ──────────────────────────────────────────────────────────
  const createPanel = () => {
    host = document.createElement('div');
    host.id = '__speed_panel_host';
    host.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;';

    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>${CSS}</style>${HTML}`;

    (document.documentElement || document.body).appendChild(host);
    setupLogic();
  };

  // ── Wire up all controls ──────────────────────────────────────────────────
  const setupLogic = () => {
    const panel       = shadow.getElementById('panel');
    const panelHeader = shadow.getElementById('panelHeader');
    const collapseBtn = shadow.getElementById('collapseBtn');
    const closeBtn    = shadow.getElementById('closeBtn');
    const clockEl     = shadow.getElementById('clockDisplay');
    const speedTimerEl = shadow.getElementById('speedTimer');
    const videoStatus = shadow.getElementById('videoStatus');
    const adStatus    = shadow.getElementById('adStatus');
    const rewindStatus = shadow.getElementById('rewindStatus');
    const loopStatus  = shadow.getElementById('loopStatus');
    const loopToggle  = shadow.getElementById('loopToggle');
    const skipAdBtn   = shadow.getElementById('skipAdBtn');
    const rewindBtn   = shadow.getElementById('rewindBtn');
    const forwardBtn  = shadow.getElementById('forwardBtn');
    const openVideoBtn = shadow.getElementById('openVideoBtn');
    const resetBtn     = shadow.getElementById('resetBtn');
    const themeButtons = shadow.querySelectorAll('.theme-btn');
    const speedButtons = shadow.querySelectorAll('.speed-btn');

    // ─ Speed timer ─
    let speedTimerInterval = null;
    let speedStartTime = null;

    const updateSpeedTimer = () => {
      if (!speedTimerEl) return;
      if (!speedStartTime) { speedTimerEl.textContent = 'Speed timer: --'; return; }
      speedTimerEl.textContent = `Speed timer: ${formatTime(Math.floor((Date.now() - speedStartTime) / 1000))}`;
    };

    const startSpeedTimer = (ts) => {
      speedStartTime = ts;
      if (speedTimerInterval) clearInterval(speedTimerInterval);
      updateSpeedTimer();
      speedTimerInterval = setInterval(updateSpeedTimer, 1000);
    };

    // ─ Auto-apply saved speed to new videos ─
    let lastAppliedVideoElements = new WeakSet();
    let savedSpeed = null;
    
    const applyAutoSpeed = () => {
      if (!savedSpeed || !Number.isFinite(savedSpeed)) savedSpeed = 1;
      const videos = getAllVideos();
      videos.forEach(v => {
        // Only apply to videos we haven't seen before
        if (!lastAppliedVideoElements.has(v)) {
          v.playbackRate = savedSpeed;
          lastAppliedVideoElements.add(v);
          
          // Attach listener to restore speed if player resets it
          const handler = () => {
            if (v.playbackRate !== savedSpeed) {
              v.playbackRate = savedSpeed;
            }
          };
          
          try {
            v.addEventListener('ratechange', handler, { passive: true });
          } catch (e) {}
        }
      });
    };

    // ─ Only restore speed if a player resets it (event-driven only) ─
    // Removed continuous polling - ratechange listeners handle most cases
    const maintainPlaybackSpeed = () => {
      // This is now called rarely; only on user interaction or status check
      if (!savedSpeed || !Number.isFinite(savedSpeed)) return;
      const videos = getAllVideos();
      videos.forEach(v => {
        if (lastAppliedVideoElements.has(v) && Math.abs(v.playbackRate - savedSpeed) > 0.01) {
          try { v.playbackRate = savedSpeed; } catch (e) {}
        }
      });
    };

    // ─ Watch for new video elements (DISABLED - too expensive) ─
    // Polls are removed to prevent browser freezes
    // Speed is maintained through event listeners only
    // const observerConfig = { childList: true, subtree: false };
    // const mutationObserver = new MutationObserver(() => { ... });
    // mutationObserver.observe(document.body, observerConfig);

    // ─ Render video status ─
    const renderStatus = (data) => {
      if (!videoStatus) return;
      if (!data) { videoStatus.textContent = 'Unable to fetch video info.'; return; }
      if (!data.found) { videoStatus.textContent = 'No video element detected on this page.'; return; }
      const current  = formatTime(data.currentTime);
      const duration = (typeof data.duration === 'number' && Number.isFinite(data.duration))
        ? formatTime(data.duration) : 'LIVE';
      const state = data.playing ? 'Playing' : 'Paused';
      const titleMarkup = data.title ? `<div class="video-title">${escapeHtml(data.title)}</div>` : '';
      videoStatus.innerHTML = `
        <div><strong>Speed:</strong> ${data.speed.toFixed(2)}x</div>
        <div><strong>Status:</strong> ${state}</div>
        <div><strong>Progress:</strong> ${current} / ${duration}</div>
        ${titleMarkup}
      `;
    };

    // ─ Theme ─
    let activeTheme = 'light';
    const applyTheme = (theme) => {
      const next = THEMES.includes(theme) ? theme : 'light';
      activeTheme = next;
      if (panel) {
        THEMES.forEach(t => panel.classList.remove(`theme-${t}`));
        panel.classList.add(`theme-${next}`);
      }
      themeButtons.forEach(btn => {
        const on = btn.dataset.theme === next;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    };

    // ─ Collapse ─
    let isCollapsed = false;
    const applyCollapsed = () => {
      if (panel) panel.classList.toggle('collapsed', isCollapsed);
      if (collapseBtn) {
        collapseBtn.textContent = isCollapsed ? '+' : '−';
        collapseBtn.title = isCollapsed ? 'Expand' : 'Collapse';
      }
    };

    // ─ Loop ─
    let isLoopEnabled = false;

    // ─ Clock (update every 2 seconds instead of 1 to reduce overhead) ─
    if (clockEl) {
      const tick = () => {
        const now = new Date();
        clockEl.textContent = [now.getHours(), now.getMinutes(), now.getSeconds()]
          .map(n => String(n).padStart(2, '0')).join(':');
      };
      tick();
      setInterval(tick, 2000); // Reduced from 1000ms to 2000ms
    }

    // ─ Load saved state ─
    storageGet(['videoSpeed', 'speedStartedAt', 'videoLoopEnabled', 'viewTheme', 'popupCollapsed'], (res) => {
      isCollapsed   = Boolean(res.popupCollapsed);
      isLoopEnabled = Boolean(res.videoLoopEnabled);
      applyCollapsed();
      applyTheme(res.viewTheme || 'light');
      if (loopToggle) loopToggle.checked = isLoopEnabled;
      if (loopStatus) loopStatus.textContent = isLoopEnabled ? 'Loop: On' : 'Loop: Off';
      
      // Restore and apply saved speed
      if (res.videoSpeed && Number.isFinite(res.videoSpeed)) {
        savedSpeed = res.videoSpeed;
        speedButtons.forEach(btn => {
          if (parseFloat(btn.getAttribute('data-speed')) === res.videoSpeed) btn.classList.add('active');
        });
        // Apply saved speed to any videos already on the page
        const videos = getAllVideos();
        videos.forEach(v => { 
          v.playbackRate = res.videoSpeed;
          lastAppliedVideoElements.add(v);
          
          // Attach listener only once per video
          if (!v.__speedControllerAttached) {
            try {
              v.addEventListener('ratechange', () => {
                // Use savedSpeed to always get current speed, not closure value
                if (v.playbackRate !== savedSpeed) {
                  v.playbackRate = savedSpeed;
                }
              }, { passive: true });
              v.__speedControllerAttached = true;
            } catch (e) {}
          }
        });
      }
      
      if (res.speedStartedAt && Number.isFinite(res.speedStartedAt)) startSpeedTimer(res.speedStartedAt);
      else updateSpeedTimer();
    });

    // ─ No continuous polling (causes browser freeze) ─
    // Speed is maintained through event listeners only
    // Status updates only when user interacts with panel

    // ─ Event: collapse ─
    collapseBtn?.addEventListener('click', () => {
      isCollapsed = !isCollapsed;
      applyCollapsed();
      storageSet({ popupCollapsed: isCollapsed });
    });

    // ─ Event: close ─
    closeBtn?.addEventListener('click', () => hidePanel());

    // ─ Event: theme buttons ─
    themeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        applyTheme(btn.dataset.theme);
        storageSet({ viewTheme: activeTheme });
      });
    });

    // ─ Apply speed helper (shared by speed buttons and reset button) ─
    let aggressiveMonitorInterval = null;
    const applySpeed = (speed) => {
      if (!Number.isFinite(speed)) return;
      
      // Clear any existing aggressive monitor
      if (aggressiveMonitorInterval) clearInterval(aggressiveMonitorInterval);
      
      speedButtons.forEach(b => b.classList.remove('active'));
      const matchingBtn = Array.from(speedButtons).find(b => parseFloat(b.getAttribute('data-speed')) === speed);
      if (matchingBtn) matchingBtn.classList.add('active');
      
      const startedAt = Date.now();
      startSpeedTimer(startedAt);
      savedSpeed = speed;
      
      // Apply to all videos found
      const videos = getAllVideos();
      videos.forEach(v => { 
        v.playbackRate = speed;
        lastAppliedVideoElements.add(v);
        
        // Attach ratechange listener if not already present
        if (!v.__speedControllerAttached) {
          try {
            v.addEventListener('ratechange', () => {
              // Use savedSpeed to always get current speed, not closure value
              if (v.playbackRate !== savedSpeed) v.playbackRate = savedSpeed;
            }, { passive: true });
            v.__speedControllerAttached = true;
          } catch (e) {}
        }
      });
      
      // AGGRESSIVE MONITORING: For first 3 seconds after speed change, check every 100ms
      // This fixes the ~2 second delay issue where players override the speed
      const monitorStartTime = Date.now();
      aggressiveMonitorInterval = setInterval(() => {
        const elapsed = Date.now() - monitorStartTime;
        if (elapsed > 3000) {
          // After 3 seconds, stop aggressive monitoring (ratechange listeners take over)
          clearInterval(aggressiveMonitorInterval);
          aggressiveMonitorInterval = null;
          return;
        }
        
        // Check all videos and restore speed if overridden
        const currentVideos = getAllVideos();
        currentVideos.forEach(v => {
          if (Math.abs(v.playbackRate - speed) > 0.01) {
            try { v.playbackRate = speed; } catch (e) {}
          }
        });
      }, 100); // Check every 100ms for speed changes
      
      sessionStorage.setItem('preferredVideoSpeed', String(speed));
      storageSet({ videoSpeed: speed, speedStartedAt: startedAt });
      renderStatus(buildSummary(videos));
    };

    // ─ Event: speed buttons ─
    speedButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const speed = parseFloat(btn.getAttribute('data-speed'));
        applySpeed(speed);
      });
    });

    // ─ Event: reset button ─
    resetBtn?.addEventListener('click', () => {
      applySpeed(1);
    });

    // ─ Event: skip ad ─
    skipAdBtn?.addEventListener('click', () => {
      if (adStatus) adStatus.textContent = 'Trying to skip ads…';
      const clickIfVisible = (sel) => {
        const el = document.querySelector(sel);
        if (el && typeof el.click === 'function' && el.offsetParent !== null) { el.click(); return true; }
        return false;
      };
      let msg = 'No skippable ad detected.';
      if (clickIfVisible('.ytp-ad-skip-button-modern.ytp-button') || clickIfVisible('.ytp-ad-skip-button.ytp-button')) {
        msg = 'Clicked YouTube skip button.';
      } else if (clickIfVisible('.ytp-ad-overlay-close-button')) {
        msg = 'Closed overlay ad.';
      } else {
        const adVideo = document.querySelector('.ad-showing video');
        if (adVideo && !Number.isNaN(adVideo.duration) && adVideo.duration > 0) {
          adVideo.currentTime = adVideo.duration;
          msg = 'Fast-forwarded ad video.';
        }
      }
      if (adStatus) adStatus.textContent = msg;
    });

    // ─ Event: rewind ─
    rewindBtn?.addEventListener('click', () => {
      if (rewindStatus) rewindStatus.textContent = 'Rewinding 60 seconds…';
      const videos = getAllVideos().filter(v => !Number.isNaN(v.currentTime));
      if (!videos.length) { if (rewindStatus) rewindStatus.textContent = 'No video found.'; return; }
      const active = videos.find(v => !v.paused) || videos[0];
      const before = active.currentTime || 0;
      active.currentTime = Math.max(0, before - 60);
      const moved = before - active.currentTime;
      if (rewindStatus) rewindStatus.textContent = moved > 0 ? `Moved back ${Math.round(moved)}s.` : 'Already at start.';
      renderStatus(buildSummary(videos));
    });

    // ─ Event: forward ─
    forwardBtn?.addEventListener('click', () => {
      const videos = getAllVideos().filter(v => !Number.isNaN(v.currentTime));
      if (!videos.length) return;
      const active = videos.find(v => !v.paused) || videos[0];
      active.currentTime = Math.max(0, (active.currentTime || 0) + 60);
    });

    // ─ Event: loop toggle ─
    loopToggle?.addEventListener('change', () => {
      const enabled = loopToggle.checked;
      const prev = isLoopEnabled;
      isLoopEnabled = enabled;
      if (loopStatus) loopStatus.textContent = enabled ? 'Loop: Turning on…' : 'Loop: Turning off…';
      const videos = getAllVideos();
      if (!videos.length) {
        if (loopStatus) loopStatus.textContent = 'No video found.';
        isLoopEnabled = prev;
        loopToggle.checked = prev;
        return;
      }
      videos.forEach(v => { v.loop = enabled; });
      storageSet({ videoLoopEnabled: enabled });
      if (loopStatus) loopStatus.textContent = enabled ? 'Loop: On' : 'Loop: Off';
      renderStatus(buildSummary(videos));
    });

    // ─ Event: open video in tab ─
    openVideoBtn?.addEventListener('click', () => {
      let videoUrl = null;
      for (const iframe of document.querySelectorAll('iframe')) {
        // Use contentDocument only — null for cross-origin, no throw, no storage access error.
        const doc = iframe.contentDocument;
        if (doc) {
          const v = doc.querySelector('video');
          if (v && v.src) { videoUrl = v.src; break; }
        }
        const src = iframe.getAttribute('src');
        if (src && !src.startsWith('blob:')) { videoUrl = src; break; }
      }
      if (!videoUrl) {
        const v = document.querySelector('video');
        if (v) videoUrl = v.src || (document.querySelector('video source') || {}).src;
      }
      if (!videoUrl) { alert('Could not find a video URL to open.'); return; }
      window.open(videoUrl, '_blank');
    });

    // ─ Dragging ─
    panelHeader?.addEventListener('mousedown', (e) => {
      if (e.target === collapseBtn || e.target === closeBtn) return;
      isDragging = true;
      const rect = host.getBoundingClientRect();
      dragOffsetX = e.clientX - rect.left;
      dragOffsetY = e.clientY - rect.top;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging || !host) return;
      const newLeft = Math.max(0, Math.min(e.clientX - dragOffsetX, window.innerWidth - 280));
      const newTop  = Math.max(0, Math.min(e.clientY - dragOffsetY, window.innerHeight - 50));
      host.style.left = `${newLeft}px`;
      host.style.top  = `${newTop}px`;
    });

    document.addEventListener('mouseup', () => { isDragging = false; });
  };

  // ── Show / hide / toggle ──────────────────────────────────────────────────
  const showPanel = () => {
    if (!host) createPanel();
    else host.style.display = '';
    isVisible = true;
    positionPanel();
    storageSet({ panelVisible: true });
  };

  const hidePanel = () => {
    if (host) host.style.display = 'none';
    isVisible = false;
    storageSet({ panelVisible: false });
  };

  const togglePanel = () => { if (isVisible) hidePanel(); else showPanel(); };

  // Expose for re-entry guard
  window.__speedPanelToggle = togglePanel;

  // ── Listen for messages from background.js ───────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.action === 'togglePanel') togglePanel();
  });

  // ── Restore panel if it was open on a previous page visit ────────────────
  storageGet(['panelVisible'], (res) => {
    if (res.panelVisible) showPanel();
  });
})();
