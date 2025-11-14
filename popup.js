document.addEventListener('DOMContentLoaded', () => {
  const buttons = document.querySelectorAll('.speed-btn');
  const clockDisplay = document.getElementById('clockDisplay');
  const statusDisplay = document.getElementById('videoStatus');
  const speedTimerDisplay = document.getElementById('speedTimer');
  let speedTimerInterval = null;
  let speedStartTime = null;

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
