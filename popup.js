document.addEventListener('DOMContentLoaded', () => {
  const buttons = document.querySelectorAll('.speed-btn');

  // Load and highlight the saved speed
  chrome.storage.local.get(['videoSpeed'], (result) => {
    if (result.videoSpeed) {
      buttons.forEach(btn => {
        if (btn.getAttribute('data-speed') === result.videoSpeed.toString()) {
          btn.classList.add('active');
        }
      });
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
      chrome.storage.local.set({ videoSpeed: parseFloat(speed) });
      
      // Get the current tab and execute script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: setVideoSpeed,
          args: [parseFloat(speed)]
        });
      });
      
      console.log(`Speed set to ${speed}x`);
    });
  });
});

// Function to set video playback speed
function setVideoSpeed(speed) {
  // Store speed in page's sessionStorage for persistence
  sessionStorage.setItem('preferredVideoSpeed', speed);
  
  const videos = document.querySelectorAll('video');
  if (videos.length > 0) {
    videos.forEach(video => {
      video.playbackRate = speed;
    });
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
}
