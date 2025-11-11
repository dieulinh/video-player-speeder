document.addEventListener('DOMContentLoaded', () => {
  const buttons = document.querySelectorAll('.speed-btn');

  buttons.forEach(button => {
    button.addEventListener('click', () => {
      const speed = button.getAttribute('data-speed');
      
      // Remove active class from all buttons
      buttons.forEach(btn => btn.classList.remove('active'));
      
      // Add active class to clicked button
      button.classList.add('active');
      console.log(`button.classList: ${button.classList}`);
      
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
  const videos = document.querySelectorAll('video');
  if (videos.length > 0) {
    videos.forEach(video => {
      video.playbackRate = speed;
    });
    console.log(`Video speed set to ${speed}x`);
  } else {
    console.log('No video found on this page');
  }
}
