document.addEventListener('DOMContentLoaded', () => {
  const buttons = document.querySelectorAll('.speed-btn');
  const clockDisplay = document.getElementById('clockDisplay');
  const statusDisplay = document.getElementById('videoStatus');
  const speedTimerDisplay = document.getElementById('speedTimer');
  const collapseBtn = document.getElementById('collapseBtn');
  const skipAdBtn = document.getElementById('skipAdBtn');
  const rewindBtn = document.getElementById('rewindBtn');
  const forwardBtn = document.getElementById('forwardBtn');
  const loopToggle = document.getElementById('loopToggle');
  const adStatusDisplay = document.getElementById('adStatus');
  const rewindStatusDisplay = document.getElementById('rewindStatus');
  const loopStatusDisplay = document.getElementById('loopStatus');
  const rootBody = document.body;
  let speedTimerInterval = null;
  let speedStartTime = null;
  let isCollapsed = false;
  let isLoopEnabled = false;

  const formatTime = (seconds) => {
    if (typeof seconds !== 'number' || Number.isNaN(seconds) || seconds < 0) {
      return '--:--';
    }

    const totalSeconds = Math.floor(seconds);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    const minutesStr = String(minutes).padStart(hours > 0 ? 2 : 1, '0');
    const secondsStr = String(secs).padStart(2, '0');

    if (hours > 0) {
      return `${hours}:${minutesStr}:${secondsStr}`;
    }
    return `${minutesStr.padStart(2, '0')}:${secondsStr}`;
  };

  const setSpeedTimerDisplay = (text) => {
    if (speedTimerDisplay) {
      speedTimerDisplay.textContent = text;
    }
  };

  const updateSpeedTimer = () => {
    if (!speedStartTime) {
      setSpeedTimerDisplay('Speed timer: --');
      return;
    }
    const elapsedSeconds = Math.floor((Date.now() - speedStartTime) / 1000);
    setSpeedTimerDisplay(`Speed timer: ${formatTime(elapsedSeconds)}`);
  };

  const startSpeedTimer = (timestamp) => {
    speedStartTime = timestamp;
    if (speedTimerInterval) {
      clearInterval(speedTimerInterval);
    }
    updateSpeedTimer();
    speedTimerInterval = setInterval(updateSpeedTimer, 1000);
  };

  const stopSpeedTimer = () => {
    if (speedTimerInterval) {
      clearInterval(speedTimerInterval);
      speedTimerInterval = null;
    }
    speedStartTime = null;
    updateSpeedTimer();
  };

  const escapeHtml = (value) => {
    if (typeof value !== 'string') return '';
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const renderStatus = (data) => {
    if (!statusDisplay) return;

    if (!data) {
      statusDisplay.textContent = 'Unable to fetch video info.';
      return;
    }

    if (!data.found) {
      statusDisplay.textContent = 'No video element detected on this page.';
      return;
    }

    const current = formatTime(data.currentTime);
    const duration = (typeof data.duration === 'number' && Number.isFinite(data.duration))
      ? formatTime(data.duration)
      : 'LIVE';
    const state = data.playing ? 'Playing' : 'Paused';
    const titleMarkup = data.title ? `<div class="video-title">${escapeHtml(data.title)}</div>` : '';

    statusDisplay.innerHTML = `
      <div><strong>Speed:</strong> ${data.speed.toFixed(2)}x</div>
      <div><strong>Status:</strong> ${state}</div>
      <div><strong>Progress:</strong> ${current} / ${duration}</div>
      ${titleMarkup}
    `;
  };

  const setAdStatus = (message) => {
    if (adStatusDisplay) {
      adStatusDisplay.textContent = message;
    }
  };

  const setRewindStatus = (message) => {
    if (rewindStatusDisplay) {
      rewindStatusDisplay.textContent = message;
    }
  };

  const setLoopStatus = (message) => {
    if (loopStatusDisplay) {
      loopStatusDisplay.textContent = message;
    }
  };

  const applyCollapsedState = () => {
    if (rootBody) {
      rootBody.classList.toggle('collapsed', isCollapsed);
    }
    if (collapseBtn) {
      collapseBtn.textContent = isCollapsed ? '+' : '−';
      collapseBtn.setAttribute('aria-expanded', String(!isCollapsed));
      collapseBtn.setAttribute('title', isCollapsed ? 'Expand panel' : 'Collapse panel');
    }
  };

  chrome.storage.local.get(['popupCollapsed', 'videoLoopEnabled'], (result) => {
    isCollapsed = Boolean(result.popupCollapsed);
    isLoopEnabled = Boolean(result.videoLoopEnabled);
    applyCollapsedState();

    if (loopToggle) {
      loopToggle.checked = isLoopEnabled;
    }
    setLoopStatus(isLoopEnabled ? 'Loop: On' : 'Loop: Off');
  });

  if (collapseBtn) {
    collapseBtn.addEventListener('click', () => {
      isCollapsed = !isCollapsed;
      applyCollapsedState();
      chrome.storage.local.set({ popupCollapsed: isCollapsed });
    });
  }

  if (skipAdBtn) {
    skipAdBtn.addEventListener('click', () => {
      setAdStatus('Trying to skip ads...');
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || !tabs.length) {
          setAdStatus('No active tab found.');
          return;
        }

        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: manageAdControl,
          args: [{ action: 'startWatcher' }]
        }, (results) => {
          if (chrome.runtime.lastError) {
            setAdStatus(`Error: ${chrome.runtime.lastError.message}`);
            return;
          }

          if (Array.isArray(results) && results.length > 0 && results[0].result) {
            const outcome = results[0].result;
            const pieces = [];
            if (outcome.message) pieces.push(outcome.message);
            if (outcome.lastAttempt) pieces.push(`Last attempt: ${outcome.lastAttempt.message}`);
            if (outcome.watcherActive) pieces.push('Watcher: ON');
            setAdStatus(pieces.join(' | ') || 'Auto skip enabled.');
          } else {
            setAdStatus('No response from page script.');
          }
        });
      });
    });
  }

  if (loopToggle) {
    loopToggle.addEventListener('change', () => {
      const previousState = isLoopEnabled;
      const enabled = Boolean(loopToggle.checked);
      isLoopEnabled = enabled;
      setLoopStatus(enabled ? 'Loop: Turning on...' : 'Loop: Turning off...');

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || !tabs.length) {
          setLoopStatus('Loop: No active tab found.');
          isLoopEnabled = previousState;
          loopToggle.checked = previousState;
          return;
        }

        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: setVideoLoop,
          args: [enabled]
        }, (results) => {
          if (chrome.runtime.lastError) {
            setLoopStatus(`Loop error: ${chrome.runtime.lastError.message}`);
            isLoopEnabled = previousState;
            loopToggle.checked = previousState;
            return;
          }

          if (!Array.isArray(results) || !results.length) {
            setLoopStatus('Loop: No response from page.');
            isLoopEnabled = previousState;
            loopToggle.checked = previousState;
            return;
          }

          const payload = results[0].result;
          if (!payload) {
            setLoopStatus('Loop: No response from page.');
            isLoopEnabled = previousState;
            loopToggle.checked = previousState;
            return;
          }

          chrome.storage.local.set({ videoLoopEnabled: enabled });

          const summary = payload.summary || payload;
          if (summary) {
            renderStatus(summary);
          }
          setLoopStatus(payload.message || (enabled ? 'Loop: On' : 'Loop: Off'));
        });
      });
    });
  }
  if (forwardBtn) {
     forwardBtn.addEventListener('click', () => {
      
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
       

        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: forwardActiveVideo,
          args: [60]
        }, (results) => {
          if (chrome.runtime.lastError) {
            console.error(`Error: ${chrome.runtime.lastError.message}`);
            return;
          }

          if (!Array.isArray(results) || !results.length) {
            console.error('No response from page script.');
            return;
          }

          
        });
      });
    });
  }
  if (rewindBtn) {
    rewindBtn.addEventListener('click', () => {
      setRewindStatus('Rewinding 60 seconds...');
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || !tabs.length) {
          setRewindStatus('No active tab found.');
          return;
        }

        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: rewindActiveVideo,
          args: [60]
        }, (results) => {
          if (chrome.runtime.lastError) {
            setRewindStatus(`Error: ${chrome.runtime.lastError.message}`);
            return;
          }

          if (!Array.isArray(results) || !results.length) {
            setRewindStatus('No response from page script.');
            return;
          }

          const payload = results[0].result;
          if (!payload) {
            setRewindStatus('No response from page script.');
            return;
          }

          if (payload.summary) {
            renderStatus(payload.summary);
            setRewindStatus(payload.message || 'Moved playback back 60 seconds.');
          } else {
            renderStatus(payload);
            setRewindStatus(payload.message || 'Attempted to rewind playback.');
          }
        });
      });
    });
  }

  // Load and highlight the saved speed
  chrome.storage.local.get(['videoSpeed', 'speedStartedAt'], (result) => {
    if (result.videoSpeed) {
      buttons.forEach(btn => {
        if (btn.getAttribute('data-speed') === result.videoSpeed.toString()) {
          btn.classList.add('active');
        }
      });
    }

    if (result.speedStartedAt && Number.isFinite(result.speedStartedAt)) {
      startSpeedTimer(result.speedStartedAt);
    } else {
      updateSpeedTimer();
    }
  });

  buttons.forEach(button => {
    button.addEventListener('click', () => {
      const speed = button.getAttribute('data-speed');
      
      // Remove active class from all buttons
      buttons.forEach(btn => btn.classList.remove('active'));
      
      // Add active class to clicked button
      button.classList.add('active');
      console.log(`button.classList: ${button.classList}`);
      
      // Save the speed to Chrome storage
      const startedAt = Date.now();
      chrome.storage.local.set({
        videoSpeed: parseFloat(speed),
        speedStartedAt: startedAt
      });
      startSpeedTimer(startedAt);
      
      // Get the current tab and execute script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: setVideoSpeed,
          args: [parseFloat(speed)]
        }, (results) => {
          if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError.message);
            renderStatus(null);
            return;
          }

          if (Array.isArray(results) && results.length > 0) {
            renderStatus(results[0].result);
          } else {
            renderStatus(null);
          }
        });
      });
      
      console.log(`Speed set to ${speed}x`);
    });
  });

  if (clockDisplay) {
    const updateClock = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      clockDisplay.textContent = `${hours}:${minutes}:${seconds}`;
    };

    updateClock();
    setInterval(updateClock, 1000);
  }

  // Ensure timer text is initialized if we didn't start it above
  updateSpeedTimer();
});

// Function to set video playback speed
function setVideoSpeed(speed) {
  // Store speed in page's sessionStorage for persistence
  sessionStorage.setItem('preferredVideoSpeed', speed);
  
  const videos = Array.from(document.querySelectorAll('video'));
  const summary = {
    found: false,
    speed,
    currentTime: 0,
    duration: null,
    playing: false,
    title: document.title || ''
  };

  if (videos.length > 0) {
    videos.forEach(video => {
      video.playbackRate = speed;
    });

    const activeVideo = videos.find(video => !Number.isNaN(video.currentTime)) || videos[0];

    if (activeVideo) {
      summary.found = true;
      summary.currentTime = activeVideo.currentTime || 0;
      summary.duration = Number.isFinite(activeVideo.duration) ? activeVideo.duration : null;
      summary.playing = !activeVideo.paused;
    }

    console.log(`Video speed set to ${speed}x`);
  } else {
    console.log('No video found on this page');
  }
  
  // Set up observer to maintain speed on new/replaced videos
  if (!window.videoSpeedObserverInitialized) {
    window.videoSpeedObserverInitialized = true;
    
    const observer = new MutationObserver(() => {
      const savedSpeed = parseFloat(sessionStorage.getItem('preferredVideoSpeed'));
      if (savedSpeed) {
        const allVideos = document.querySelectorAll('video');
        allVideos.forEach(video => {
          if (Math.abs(video.playbackRate - savedSpeed) > 0.01) {
            video.playbackRate = savedSpeed;
            console.log(`Reapplied speed ${savedSpeed}x to video`);
          }
        });
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    // Also listen for when videos start playing
    document.addEventListener('play', (e) => {
      if (e.target.tagName === 'VIDEO') {
        const savedSpeed = parseFloat(sessionStorage.getItem('preferredVideoSpeed'));
        if (savedSpeed) {
          e.target.playbackRate = savedSpeed;
          console.log(`Applied speed ${savedSpeed}x on play event`);
        }
      }
    }, true);
  }

  return summary;
}

function setVideoLoop(enabled) {
  const shouldLoop = Boolean(enabled);
  sessionStorage.setItem('preferredVideoLoop', shouldLoop ? 'true' : 'false');

  const videos = Array.from(document.querySelectorAll('video'));
  const summary = {
    found: false,
    speed: 1,
    currentTime: 0,
    duration: null,
    playing: false,
    title: document.title || ''
  };

  if (videos.length > 0) {
    videos.forEach(video => {
      video.loop = shouldLoop;
    });

    const activeVideo = videos.find(video => !Number.isNaN(video.currentTime)) || videos[0];

    if (activeVideo) {
      summary.found = true;
      summary.speed = activeVideo.playbackRate || 1;
      summary.currentTime = activeVideo.currentTime || 0;
      summary.duration = Number.isFinite(activeVideo.duration) ? activeVideo.duration : null;
      summary.playing = !activeVideo.paused;
    }
  }

  const applyLoopSetting = () => {
    const savedLoop = sessionStorage.getItem('preferredVideoLoop') === 'true';
    document.querySelectorAll('video').forEach(video => {
      if (video.loop !== savedLoop) {
        video.loop = savedLoop;
      }
    });
  };

  if (!window.videoLoopObserverInitialized) {
    window.videoLoopObserverInitialized = true;
    window.videoLoopApplySetting = applyLoopSetting;

    const observer = new MutationObserver(() => {
      if (typeof window.videoLoopApplySetting === 'function') {
        window.videoLoopApplySetting();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    document.addEventListener('play', () => {
      if (typeof window.videoLoopApplySetting === 'function') {
        window.videoLoopApplySetting();
      }
    }, true);

    window.videoLoopObserver = observer;
  } else if (typeof window.videoLoopApplySetting === 'function') {
    window.videoLoopApplySetting();
  }

  const message = shouldLoop ? 'Loop: On' : 'Loop: Off';

  return {
    summary,
    loopEnabled: shouldLoop,
    message
  };
}

// Function injected into pages to handle ad skipping and watcher lifecycle
function manageAdControl(options = {}) {
  const action = options.action || 'startWatcher';

  const ensureState = () => {
    if (!window.__adSkipperState) {
      window.__adSkipperState = {
        intervalId: null,
        observer: null,
        lastMessage: 'Initialized.'
      };
    }
    return window.__adSkipperState;
  };

  const attemptSkip = () => {
    const result = {
      attempted: true,
      skipped: false,
      message: 'No ad controls detected.'
    };

    try {
      const clickIfVisible = (selector) => {
        const el = document.querySelector(selector);
        if (el && typeof el.click === 'function' && el.offsetParent !== null) {
          el.click();
          return true;
        }
        return false;
      };

      if (clickIfVisible('.ytp-ad-skip-button-modern.ytp-button') || clickIfVisible('.ytp-ad-skip-button.ytp-button')) {
        result.skipped = true;
        result.message = 'Clicked YouTube skip button.';
        return result;
      }

      if (clickIfVisible('.ytp-ad-overlay-close-button')) {
        result.skipped = true;
        result.message = 'Closed overlay ad.';
        return result;
      }

      const adVideo = document.querySelector('.ad-showing video');
      if (adVideo && !Number.isNaN(adVideo.duration) && adVideo.duration > 0) {
        adVideo.currentTime = adVideo.duration;
        result.skipped = true;
        result.message = 'Fast-forwarded ad video.';
        return result;
      }

      const videos = Array.from(document.querySelectorAll('video'));
      const candidate = videos.find(video => {
        if (!video || Number.isNaN(video.duration) || video.duration === Infinity) return false;
        const shortContent = video.duration > 0 && video.duration <= 45;
        const isVisible = video.offsetHeight > 0 && video.offsetWidth > 0;
        const inAdContainer = !!(video.closest('.ad-container') || video.closest('.ad-showing'));
        return isVisible && (shortContent || inAdContainer);
      });

      if (candidate) {
        candidate.currentTime = candidate.duration;
        result.skipped = true;
        result.message = 'Skipped probable ad video.';
        return result;
      }

      result.message = 'No skippable ad detected right now.';
      return result;
    } catch (error) {
      result.message = `Error while skipping ad: ${error.message}`;
      return result;
    }
  };

  const state = ensureState();

  if (action === 'skipOnce') {
    const attempt = attemptSkip();
    state.lastMessage = attempt.message;
    return {
      action,
      watcherActive: !!(state.intervalId || state.observer),
      lastAttempt: attempt,
      message: attempt.message
    };
  }

  if (action === 'stopWatcher') {
    if (state.intervalId) {
      clearInterval(state.intervalId);
      state.intervalId = null;
    }
    if (state.observer) {
      try {
        state.observer.disconnect();
      } catch (error) {}
      state.observer = null;
    }
    state.lastMessage = 'Watcher stopped.';
    return {
      action,
      watcherActive: false,
      lastAttempt: null,
      message: 'Auto skip watcher stopped.'
    };
  }

  if (action === 'startWatcher') {
    if (state.intervalId || state.observer) {
      const attempt = attemptSkip();
      state.lastMessage = attempt.message;
      return {
        action,
        watcherActive: true,
        lastAttempt: attempt,
        message: 'Watcher already active.'
      };
    }

    const attempt = attemptSkip();
    state.lastMessage = attempt.message;

    state.intervalId = window.setInterval(() => {
      const res = attemptSkip();
      state.lastMessage = res.message;
    }, 1500);

    try {
      state.observer = new MutationObserver(() => {
        const res = attemptSkip();
        state.lastMessage = res.message;
      });
      state.observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true
      });
    } catch (error) {
      state.observer = null;
    }

    return {
      action,
      watcherActive: true,
      lastAttempt: attempt,
      message: 'Auto skip watcher enabled.'
    };
  }

  return {
    action,
    watcherActive: !!(state.intervalId || state.observer),
    lastAttempt: null,
    message: `Unknown action: ${action}`
  };
}
function forwardActiveVideo(seconds = 60) {
  const step = Number.isFinite(Number(seconds)) ? Math.max(1, Number(seconds)) : 60;
  const videos = Array.from(document.querySelectorAll('video')).filter(video => !Number.isNaN(video.currentTime));
  const activeVideo = videos.find(video => !video.paused) || videos[0];
  const before = Number(activeVideo.currentTime) || 0;
  const target = Math.max(0, before + step);
  activeVideo.currentTime = target;

}

// Function injected into pages to rewind the active video
function rewindActiveVideo(seconds = 60) {
  const step = Number.isFinite(Number(seconds)) ? Math.max(1, Number(seconds)) : 60;
  const videos = Array.from(document.querySelectorAll('video')).filter(video => !Number.isNaN(video.currentTime));

  if (!videos.length) {
    return {
      summary: {
        found: false,
        speed: 1,
        currentTime: 0,
        duration: null,
        playing: false,
        title: document.title || ''
      },
      message: 'No video element detected on this page.'
    };
  }

  const activeVideo = videos.find(video => !video.paused) || videos[0];
  const before = Number(activeVideo.currentTime) || 0;
  const target = Math.max(0, before - step);
  activeVideo.currentTime = target;

  const summary = {
    found: true,
    speed: activeVideo.playbackRate || 1,
    currentTime: activeVideo.currentTime,
    duration: Number.isFinite(activeVideo.duration) ? activeVideo.duration : null,
    playing: !activeVideo.paused,
    title: document.title || ''
  };

  const moved = before - activeVideo.currentTime;
  const message = moved > 0
    ? `Moved back ${Math.round(moved)} seconds.`
    : 'Already at the start of the video.';

  return {
    summary,
    message
  };
}
