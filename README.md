# Docmost Clipper

A Chrome extension to clip web pages and save them directly to your self-hosted [Docmost](https://docmost.com) instance.

## Features

- **Seamless Integration**: Connects to your self-hosted Docmost instance.
- **Secure Authentication**: Supports Standard Email/Password login (Session Cookies).
- **Smart Extraction**: Uses Mozilla's Readability library to extract the main content of any web page.
- **Organization**: Choose the specific Space where you want to save the clipped page.
- **Clean Output**: Saves pages as clean HTML files, preserving formatting and links.

## Installation

1.  Clone or download this repository.
2.  Open Chrome and navigate to `chrome://extensions/`.
3.  Enable **Developer mode** (top right).
4.  Click **Load unpacked**.
5.  Select the `docmost-clipper` folder.

## Usage

1.  **Configuration**:
    - Click the extension icon.
    - Enter your **Docmost URL** (e.g., `https://docmost.yourdomain.com`).
    - Enter your **Email** and **Password**.
    - Click **Connect & Save**.

2.  **Clipping**:
    - Navigate to any article or page you wish to save.
    - Click the extension icon.
    - The page title is auto-filled (editable).
    - Select a **Space** from the dropdown.
    - Click **Clip to Docmost**.

## Project Structure

- `manifest.json`: Extension configuration (Manifest V3).
- `popup/`: UI logic (Login, Settings, Clipper).
- `src/content.js`: Content script for page extraction.
- `src/background.js`: Service worker.
- `src/libs/`: Third-party libraries (Readability.js).

## License

[MIT](LICENSE)
