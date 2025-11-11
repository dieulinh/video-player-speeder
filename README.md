# Speed Buttons Chrome Extension

A Chrome extension with 10 buttons (1x to 10x) to control video playback speed.

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `chrome-extension-buttons` folder

## Usage

1. Navigate to any webpage with a video (YouTube, Vimeo, etc.)
2. Click the extension icon in your toolbar
3. Click any button (1x to 10x) to set the video playback speed

## Features

- 10 speed buttons (1x to 10x)
- Visual feedback when clicking buttons
- Works with any HTML5 video player
- Clean, modern UI

## Files

- `manifest.json` - Extension configuration
- `popup.html` - Extension popup UI
- `popup.css` - Styles for the popup
- `popup.js` - Logic for button functionality

## Notes

You'll need to add icon files (icon16.png, icon48.png, icon128.png) or remove the icon references from manifest.json to avoid warnings.
