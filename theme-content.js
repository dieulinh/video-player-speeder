(() => {
  if (window.__speedThemeWidgetInitialized) return;
  window.__speedThemeWidgetInitialized = true;

  const THEME_KEY = 'viewTheme';
  const OVERLAY_ID = '__speed_theme_overlay';
  const storageLocal = chrome?.storage?.local;
  const storageGet = (keys, cb) => {
    if (storageLocal) {
      storageLocal.get(keys, cb);
      return;
    }
    if (typeof cb === 'function') cb({});
  };
  const storageSet = (values) => {
    if (storageLocal) {
      storageLocal.set(values);
    }
  };
  const themes = {
    light: { label: 'Day', overlay: 'transparent', opacity: 0 },
    dim: { label: 'Dim', overlay: 'rgba(0, 0, 0, 0.28)', opacity: 1 },
    night: { label: 'Night', overlay: 'rgba(4, 6, 12, 0.45)', opacity: 1 },
    movie: { label: 'Movie', overlay: 'linear-gradient(135deg, rgba(8, 4, 0, 0.55), rgba(10, 6, 0, 0.35))', opacity: 1 },
    reading: { label: 'Reading', overlay: 'rgba(248, 238, 214, 0.35)', opacity: 1 },
    focus: { label: 'Focus', overlay: 'rgba(4, 12, 18, 0.45)', opacity: 1, backdropFilter: 'blur(1px)' },
    romantic: { label: 'Romantic', overlay: 'rgba(255, 210, 220, 0.4)', opacity: 1, backdropFilter: 'blur(0.5px)' },
    vintage: { label: 'Vintage', overlay: 'rgba(205, 180, 140, 0.38)', opacity: 1, backdropFilter: 'saturate(0.9) sepia(0.12)' }
  };

  const ensureOverlay = () => {
    let overlay = document.getElementById(OVERLAY_ID);
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '2147483000';
    overlay.style.transition = 'background 0.2s ease, opacity 0.2s ease, backdrop-filter 0.2s ease';
    overlay.style.mixBlendMode = 'normal';
    overlay.style.opacity = '0';
    document.documentElement.appendChild(overlay);
    return overlay;
  };

  const setButtonsActive = (container, theme) => {
    container.querySelectorAll('.speed-theme-btn').forEach(btn => {
      const isActive = btn.dataset.theme === theme;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  };

  const applyTheme = (theme, { persist = true, buttonContainer = null } = {}) => {
    const config = themes[theme] || themes.light;
    const overlay = ensureOverlay();

    overlay.style.background = config.overlay || 'transparent';
    overlay.style.opacity = String(config.opacity ?? 0);
    overlay.style.backdropFilter = config.backdropFilter || 'none';
    overlay.style.filter = config.filter || 'none';
    overlay.style.mixBlendMode = config.mixBlendMode || 'normal';

    document.documentElement.dataset.speedTheme = theme;
    if (buttonContainer) setButtonsActive(buttonContainer, theme);

    if (persist) {
      storageSet({ [THEME_KEY]: theme });
    }
  };

  const buildWidget = (initialTheme) => {
    const container = document.createElement('div');
    container.className = 'speed-theme-widget';

    const card = document.createElement('div');
    card.className = 'speed-theme-card';

    const header = document.createElement('div');
    header.className = 'speed-theme-header';

    const title = document.createElement('div');
    title.className = 'speed-theme-title';
    title.textContent = 'Screen mode';

    const actions = document.createElement('div');
    actions.className = 'speed-theme-actions';

    const collapseBtn = document.createElement('button');
    collapseBtn.type = 'button';
    collapseBtn.className = 'speed-theme-icon-btn';
    collapseBtn.textContent = '−';
    collapseBtn.title = 'Hide controls';

    actions.appendChild(collapseBtn);
    header.append(title, actions);

    const body = document.createElement('div');
    body.className = 'speed-theme-body';

    const grid = document.createElement('div');
    grid.className = 'speed-theme-grid';

    Object.entries(themes).forEach(([key, cfg]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'speed-theme-btn';
      btn.dataset.theme = key;
      btn.textContent = cfg.label;
      btn.addEventListener('click', () => applyTheme(key, { buttonContainer: grid }));
      grid.appendChild(btn);
    });

    const note = document.createElement('div');
    note.className = 'speed-theme-note';
    note.textContent = 'Applies a soft overlay to this tab only.';

    body.append(grid, note);
    card.append(header, body);
    container.appendChild(card);
    document.body.appendChild(container);

    collapseBtn.addEventListener('click', () => {
      const isCollapsed = body.classList.toggle('collapsed');
      collapseBtn.textContent = isCollapsed ? '+' : '−';
      collapseBtn.title = isCollapsed ? 'Show controls' : 'Hide controls';
    });

    setButtonsActive(grid, initialTheme);
    return { grid };
  };

  const init = () => {
    const start = () => {
      if (!document.body) return false;

      const fallbackTheme = 'light';
      const onReady = (savedTheme) => {
        const effectiveTheme = themes[savedTheme] ? savedTheme : fallbackTheme;
        const { grid } = buildWidget(effectiveTheme);
        applyTheme(effectiveTheme, { persist: false, buttonContainer: grid });
      };

      if (storageLocal) {
        storageGet([THEME_KEY], (result) => {
          const saved = result?.[THEME_KEY];
          onReady(saved);
        });
      } else {
        onReady(fallbackTheme);
      }
      return true;
    };

    if (!start()) {
      const observer = new MutationObserver(() => {
        if (start()) observer.disconnect();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  };

  init();
})();
