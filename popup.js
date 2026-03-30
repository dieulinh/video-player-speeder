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
  const themeButtons = document.querySelectorAll('.theme-btn');
  const availableThemes = ['light', 'dim', 'night', 'movie', 'reading', 'focus'];
  let speedTimerInterval = null;
  let speedStartTime = null;
  let isCollapsed = false;
  let isLoopEnabled = false;
  let activeTheme = 'light';

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

  const applyTheme = (theme) => {
    const nextTheme = availableThemes.includes(theme) ? theme : 'light';
    activeTheme = nextTheme;

    if (rootBody) {
      availableThemes.forEach(name => rootBody.classList.remove(`theme-${name}`));
      rootBody.classList.add(`theme-${nextTheme}`);
    }

    themeButtons.forEach(btn => {
      const isActive = btn.dataset.theme === nextTheme;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  };

  applyTheme(activeTheme);

  chrome.storage.local.get(['popupCollapsed', 'videoLoopEnabled', 'viewTheme'], (result) => {
    isCollapsed = Boolean(result.popupCollapsed);
    isLoopEnabled = Boolean(result.videoLoopEnabled);
    activeTheme = result.viewTheme || 'light';
    applyCollapsedState();
    applyTheme(activeTheme);

    if (loopToggle) {
      loopToggle.checked = isLoopEnabled;
    }
    setLoopStatus(isLoopEnabled ? 'Loop: On' : 'Loop: Off');
  });

  themeButtons.forEach(button => {
    button.addEventListener('click', () => {
      const selectedTheme = button.dataset.theme;
      applyTheme(selectedTheme);
      chrome.storage.local.set({ viewTheme: activeTheme });
    });
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

  // Open largest iframe video in new tab
  const openIframeVideoBtn = document.getElementById('openIframeVideoBtn');
  if (openIframeVideoBtn) {
    openIframeVideoBtn.addEventListener('click', () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || !tabs.length) {
          alert('No active tab found.');
          return;
        }

        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: openLargestIframeVideoInNewTab
        }, (results) => {
          if (chrome.runtime.lastError) {
            alert(`Error: ${chrome.runtime.lastError.message}`);
            return;
          }
          alert('Opening video in new tab...');
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
  
  // Helper function to get all video elements including those in shadow DOM
  function getAllVideoElements() {
    const videos = [];
    console.log('Searching for video elements in the page...');
    
    // Get all video elements from regular DOM
    videos.push(...Array.from(document.querySelectorAll('video')));
    if (videos.length > 0)
    {
      console.log(`Found ${videos.length} video(s) in regular DOM.`);
      console.log(videos);
    }
    
    
    // Search within shadow DOM elements
    const allElements = document.querySelectorAll('*');
    allElements.forEach(element => {
      if (element.shadowRoot) {
        const shadowVideos = Array.from(element.shadowRoot.querySelectorAll('video'));
        videos.push(...shadowVideos);
      }
    });
    
    // Search within iframes (same-origin only)
    const iframes = Array.from(document.querySelectorAll('iframe'));
    console.log(`Found ${iframes.length} iframe(s) on the page.`);
    iframes.forEach(iframe => {
      const iframeDoc = iframe.contentDocument;
      if (!iframeDoc) return; // cross-origin — skip silently
      const iframeVideos = Array.from(iframeDoc.querySelectorAll('video'));
      videos.push(...iframeVideos);
      console.log(`Found ${iframeVideos.length} video(s) in iframe`);
      iframeDoc.querySelectorAll('*').forEach(element => {
        if (element.shadowRoot) {
          videos.push(...Array.from(element.shadowRoot.querySelectorAll('video')));
        }
      });
    });
    
    return videos;
  }
  
  // Helper function to force set speed on a video element
  function forceSetSpeed(video, targetSpeed) {
    video.playbackRate = targetSpeed;
    // For blob videos, we need to be extra aggressive
    if (video.src && video.src.includes('blob:')) {
      console.log('Applying extra speed enforcement for blob video:', video.src);
      // Try multiple times to ensure it sticks
      setTimeout(() => { video.playbackRate = targetSpeed; }, 0);
      setTimeout(() => { video.playbackRate = targetSpeed; }, 50);
      setTimeout(() => { video.playbackRate = targetSpeed; }, 100);
    }
  }
  
  const videos = getAllVideoElements();
  const summary = {
    found: false,
    speed,
    currentTime: 0,
    duration: null,
    playing: false,
    title: document.title || ''
  };

  if (videos.length > 0) {
    videos.forEach((video, index) => {
      forceSetSpeed(video, speed);
      // Log video info including blob URLs
      console.log(`[${index + 1}/${videos.length}] Set speed ${speed}x on video element`, {
        src: video.src || 'no src',
        isBlob: video.src && video.src.includes('blob:'),
        sources: Array.from(video.querySelectorAll('source')).map(s => s.src),
        className: video.className,
        id: video.id,
        inShadowDOM: !document.contains(video)
      });
    });

    // Find the most relevant active video (prefer playing videos, then visible ones)
    const playingVideo = videos.find(video => !video.paused && !Number.isNaN(video.currentTime));
    const visibleVideo = videos.find(video => {
      try {
        const rect = video.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && !Number.isNaN(video.currentTime);
      } catch (e) {
        return false;
      }
    });
    const activeVideo = playingVideo || visibleVideo || videos.find(video => !Number.isNaN(video.currentTime)) || videos[0];

    if (activeVideo) {
      summary.found = true;
      summary.currentTime = activeVideo.currentTime || 0;
      summary.duration = Number.isFinite(activeVideo.duration) ? activeVideo.duration : null;
      summary.playing = !activeVideo.paused;
    }

    console.log(`✅ Video speed set to ${speed}x (found ${videos.length} video element(s) across ${Array.from(document.querySelectorAll('iframe')).length} iframe(s))`);
  } else {
    console.log('No video element found on this page');
  }
  
  // Set up observer to maintain speed on new/replaced videos
  if (!window.videoSpeedObserverInitialized) {
    window.videoSpeedObserverInitialized = true;
    
    const observer = new MutationObserver(() => {
      const savedSpeed = parseFloat(sessionStorage.getItem('preferredVideoSpeed'));
      if (savedSpeed) {
        const allVideos = getAllVideoElements();
        allVideos.forEach(video => {
          if (Math.abs(video.playbackRate - savedSpeed) > 0.01) {
            forceSetSpeed(video, savedSpeed);
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
          forceSetSpeed(e.target, savedSpeed);
          console.log(`Applied speed ${savedSpeed}x on play event`, {
            src: e.target.src,
            isBlob: e.target.src && e.target.src.includes('blob:'),
            className: e.target.className
          });
        }
      }
    }, true);
    
    // Listen for rate change attempts and enforce saved speed
    document.addEventListener('ratechange', (e) => {
      if (e.target.tagName === 'VIDEO') {
        const savedSpeed = parseFloat(sessionStorage.getItem('preferredVideoSpeed'));
        if (savedSpeed && Math.abs(e.target.playbackRate - savedSpeed) > 0.01) {
          forceSetSpeed(e.target, savedSpeed);
          console.log(`Enforced speed ${savedSpeed}x on ratechange event`);
        }
      }
    }, true);
    
    // Additional enforcement: check every 100ms for all videos in all iframes
    setInterval(() => {
      const savedSpeed = parseFloat(sessionStorage.getItem('preferredVideoSpeed'));
      if (savedSpeed) {
        const allVideos = getAllVideoElements();
        allVideos.forEach(video => {
          // Enforce speed on all videos, especially aggressive for blob videos
          if (Math.abs(video.playbackRate - savedSpeed) > 0.01) {
            video.playbackRate = savedSpeed;
            if (video.src && video.src.includes('blob:')) {
              console.log(`Re-enforced blob video speed to ${savedSpeed}x`);
            }
          }
        });
      }
    }, 100);
  }

  return summary;
}

function openLargestIframeVideoInNewTab() {
  // Find all iframes
  const iframes = Array.from(document.querySelectorAll('iframe'));
  const accessibleIframes = [];
  const crossOriginIframes = [];

  console.log(`Found ${iframes.length} iframe(s) on the page`);

  iframes.forEach((iframe, index) => {
    const rect = iframe.getBoundingClientRect();
    const size = rect.width * rect.height;
    const src = iframe.getAttribute('src');
    
    const iframeDoc = iframe.contentDocument;
    if (iframeDoc) {
      const videos = Array.from(iframeDoc.querySelectorAll('video'));
      if (videos.length > 0) {
        accessibleIframes.push({
          iframe,
          iframeDoc,
          videos,
          size,
          width: rect.width,
          height: rect.height,
          src,
          type: 'same-origin'
        });
        console.log(`[${index}] Same-origin iframe with ${videos.length} video(s): ${rect.width}x${rect.height}px`);
      }
    } else {
      // Cross-origin — contentDocument is null, no throw, no storage access error
      console.log(`[${index}] Cross-origin iframe (cannot access content): ${rect.width}x${rect.height}px, src: ${src}`);
      crossOriginIframes.push({
        iframe,
        size,
        width: rect.width,
        height: rect.height,
        src,
        type: 'cross-origin'
      });
    }
  });

  let videoUrl = null;
  let source = '';

  // Priority 1: Use same-origin iframe with videos
  if (accessibleIframes.length > 0) {
    const largestIframe = accessibleIframes.reduce((largest, current) => 
      current.size > largest.size ? current : largest
    );

    console.log(`Using largest same-origin iframe: ${largestIframe.width}x${largestIframe.height}px`);
    const video = largestIframe.videos[0];

    if (video.src) {
      videoUrl = video.src;
    } else {
      const sources = Array.from(video.querySelectorAll('source'));
      if (sources.length > 0) {
        videoUrl = sources[0].src;
      }
    }
    
    source = 'same-origin iframe';
  } 
  // Priority 2: Use largest cross-origin iframe's src
  else if (crossOriginIframes.length > 0) {
    const largestCrossOrigin = crossOriginIframes.reduce((largest, current) => 
      current.size > largest.size ? current : largest
    );

    if (largestCrossOrigin.src && !largestCrossOrigin.src.includes('blob:')) {
      videoUrl = largestCrossOrigin.src;
      source = 'cross-origin iframe (direct navigation)';
      console.log(`Using cross-origin iframe src: ${videoUrl}`);
    }
  }
  // Priority 3: Look for videos in main page
  else {
    const mainPageVideos = Array.from(document.querySelectorAll('video'));
    if (mainPageVideos.length > 0) {
      const largestVideo = mainPageVideos.reduce((largest, current) => {
        const largestRect = largest.getBoundingClientRect();
        const currentRect = current.getBoundingClientRect();
        return (largestRect.width * largestRect.height) > (currentRect.width * currentRect.height) ? largest : current;
      });

      if (largestVideo.src) {
        videoUrl = largestVideo.src;
      } else {
        const sources = Array.from(largestVideo.querySelectorAll('source'));
        if (sources.length > 0) {
          videoUrl = sources[0].src;
        }
      }

      source = 'main page';
      console.log(`Using video from main page`);
    }
  }

  if (!videoUrl) {
    alert('Could not find video.\n\nOptions:\n1. If the video is in a cross-origin iframe, right-click it and select "Open Frame in New Tab"\n2. The video might be using blob URLs which cannot be directly accessed');
    return;
  }

  console.log(`Opening video from ${source}: ${videoUrl}`);

  // Get the current speed setting
  const currentSpeed = parseFloat(sessionStorage.getItem('preferredVideoSpeed')) || 1;

  // Store the speed in sessionStorage so the new tab can access it
  sessionStorage.setItem('videoSpeedToApply', currentSpeed);

  // Open the video in a new tab
  window.open(videoUrl, '_blank');
}

function setVideoLoop(enabled) {
  const shouldLoop = Boolean(enabled);
  sessionStorage.setItem('preferredVideoLoop', shouldLoop ? 'true' : 'false');

  // Helper function to get all video elements including those in shadow DOM
  function getAllVideoElements() {
    const videos = [];
    
    // Get all video elements from regular DOM
    videos.push(...Array.from(document.querySelectorAll('video')));
    
    // Search within shadow DOM elements
    const allElements = document.querySelectorAll('*');
    allElements.forEach(element => {
      if (element.shadowRoot) {
        const shadowVideos = Array.from(element.shadowRoot.querySelectorAll('video'));
        videos.push(...shadowVideos);
      }
    });
    
    // Search within iframes (same-origin only)
    const iframes = Array.from(document.querySelectorAll('iframe'));
    iframes.forEach(iframe => {
      const iframeDoc = iframe.contentDocument;
      if (!iframeDoc) return; // cross-origin — skip silently
      const iframeVideos = Array.from(iframeDoc.querySelectorAll('video'));
      videos.push(...iframeVideos);
      iframeDoc.querySelectorAll('*').forEach(element => {
        if (element.shadowRoot) {
          videos.push(...Array.from(element.shadowRoot.querySelectorAll('video')));
        }
      });
    });
    
    return videos;
  }

  const videos = getAllVideoElements();
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
    const allVideos = getAllVideoElements();
    allVideos.forEach(video => {
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
