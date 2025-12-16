# Docmost Clipper

A Chrome extension to clip web pages, articles, and selections directly to your self-hosted [Docmost](https://docmost.com) instance.

## ✨ Features

- **🔌 Seamless Integration**: Connects securely to your self-hosted Docmost instance.
- **🔒 Secure Authentication**: Supports standard Email/Password login (Session Cookies) with persisted sessions.
- **📄 Smart Extraction**: Built with Mozilla's Readability library to strip clutter and capture specific page content.
- **✂️ Deep Clipping Control**:
    - **Full Page**: Captures the main article content.
    - **Selection Only**: Toggle to clip only the text you've highlighted.
- **📝 User Notes**: Add context, summaries, or thoughts to the top of your clipped pages.
- **📂 Smart Organization**:
    - Fetch and select from your existing Spaces.
    - **Create New Space** directly from the extension dropdown.
- **🌗 Theme Customization**: Native support for **Dark Mode**, **Light Mode**, or automatic System Sync.
- **⚡ Quick Actions**: Auto-generated page titles and intelligent slug generation for new spaces.

## 🛠 Installation

1.  Clone or download this repository.
2.  Open Chrome and go to `chrome://extensions/`.
3.  Enable **Developer mode** (toggle in the top right).
4.  Click **Load unpacked**.
5.  Select the `docmost-clipper` folder.

## 🚀 Usage

### 1. Connect
1.  Click the extension icon.
2.  Enter your **Docmost URL** (e.g., `https://docmost.mydomain.com`).
3.  Enter your **Email** and **Password**.
4.  Click **Connect**.

### 2. Clip Content
1.  Navigate to the web page you want to save.
2.  *(Optional)* Highlight specific text if you only want that portion.
3.  Click the extension icon.
4.  **Review Details**:
    - **Title**: Edit the auto-detected page title if needed.
    - **Clip Selection Only**: Check this box (visible if you highlighted text) to save only the selection.
    - **Notes**: Typed notes will be added as a styled block at the top of the content.
5.  **Select Space**:
    - Choose an existing Space from the dropdown.
    - Or select **"+ Create New Space"** to instantly create a new destination.
6.  Click **Clip to Docmost**.

### 3. Settings
- Click the **Settings** button in the clipper view.
- **Theme**: Switch between `System (Auto)`, `Light`, or `Dark`.
- Click **Save** to apply changes and return to clipping.
- **Disconnect**: Log out to clear your session token.

## 🔒 Permissions

The extension requires the following permissions to function:
- **`activeTab`**: To access the content of the current tab when you click the extension.
- **`scripting`**: To robustly inject the content extraction script into pages.
- **`storage`**: To securely save your Docmost URL, session token, and preferences.
- **`Host Permissions`**: To allow the extension to clip content from any website you visit.

## 📂 Project Structure

- **`manifest.json`**: Manifest V3 configuration.
- **`popup/`**:
    - `popup.html`: The interface structure.
    - `popup.css`: Styling with CSS Variables for theming.
    - `popup.js`: Core logic for Auth, Spaces API, and State Management.
- **`src/`**:
    - `content.js`: Script to parse DOM and capture selections.
    - `background.js`: Service worker.
    - `libs/Readability.js`: Content extraction engine.

## License

This Chrome extension is an independent client for Docmost instances.
Docmost is licensed under the AGPL-3.0.

This extension does not include, modify, or derive from Docmost source code.
It communicates exclusively through Docmost's public HTTP API.

MIT License

Copyright (c) 2025 - Emmanuel Legrand

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.