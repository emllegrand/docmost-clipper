// popup/popup.js

document.addEventListener('DOMContentLoaded', async () => {
    const views = {
        settings: document.getElementById('settings-view'),
        clipper: document.getElementById('clipper-view')
    };

    // UI Elements
    const inputs = {
        url: document.getElementById('docmost-url'),
        email: document.getElementById('auth-email'),
        password: document.getElementById('auth-password'),

        title: document.getElementById('page-title'),
        spaceSelect: document.getElementById('space-select'),

        loginForm: document.getElementById('login-form'),
        logoutSection: document.getElementById('logout-section')
    };

    const buttons = {
        saveSettings: document.getElementById('save-settings'),
        disconnect: document.getElementById('disconnect-btn'),
        clip: document.getElementById('clip-btn'),
        settings: document.getElementById('settings-btn'),
        exitSettings: document.getElementById('exit-settings-btn')
    };

    const statusMsg = document.getElementById('status-message');

    // Load Settings
    const stored = await chrome.storage.local.get(['docmostUrl', 'authToken']);

    // Initialize View
    if (stored.docmostUrl) {
        inputs.url.value = stored.docmostUrl;

        if (stored.authToken) {
            toggleLoginState(true);

            // Try explicit auto-login/fetch spaces
            try {
                const spaces = await fetchSpaces(stored.docmostUrl, stored.authToken);
                showView('clipper');
                populateSpaces(spaces);
                initializeClipView();
            } catch (e) {
                console.warn('Auto-login check failed', e);
            }
        } else {
            toggleLoginState(false);
        }
    }

    // --- Event Listeners ---

    buttons.saveSettings.addEventListener('click', async () => {
        const url = inputs.url.value.replace(/\/$/, '');
        const email = inputs.email.value.trim();
        const password = inputs.password.value;

        if (!url) {
            showStatus('Please enter Docmost URL.', 'error');
            return;
        }

        if (!email || !password) {
            showStatus('Please enter Email and Password.', 'error');
            return;
        }

        buttons.saveSettings.disabled = true;
        buttons.saveSettings.textContent = 'Connecting...';
        showStatus('Connecting...', 'success');

        try {
            await login(url, email, password);

            const dummyToken = 'cookie-session';

            const spaces = await fetchSpaces(url, null);

            await chrome.storage.local.set({
                docmostUrl: url,
                authToken: dummyToken
            });

            toggleLoginState(true);
            showView('clipper');
            populateSpaces(spaces);
            showStatus('Connected successfully!', 'success');
            initializeClipView();

        } catch (err) {
            console.error(err);
            showStatus('Connection failed: ' + err.message, 'error');
        } finally {
            buttons.saveSettings.disabled = false;
            buttons.saveSettings.textContent = 'Connect & Save';
        }
    });

    buttons.disconnect.addEventListener('click', async () => {
        await chrome.storage.local.remove('authToken');
        toggleLoginState(false);
        inputs.email.value = '';
        inputs.password.value = '';
        showStatus('Disconnected.', 'success');
    });

    buttons.settings.addEventListener('click', () => {
        showView('settings');
    });

    // New Exit Settings Listener
    if (buttons.exitSettings) {
        buttons.exitSettings.addEventListener('click', () => {
            // Only allow exit if we are connected (token exists)
            // Or just try to switch and let the view state handle it?
            // If not connected, switching to clipper view might show empty state or error?
            // But user asked for "Exit settings" to return to previous page.
            // If previous page was clipper, then yes.
            // If we just opened popup and it defaulted to settings (because not logged in), 
            // clicking exit might not be useful, but let's allow it.
            // It will just show the clipper view.
            showView('clipper');
        });
    }

    buttons.clip.addEventListener('click', async () => {
        const spaceId = inputs.spaceSelect.value;
        if (!spaceId) {
            showStatus('Please select a Space.', 'error');
            return;
        }

        buttons.clip.disabled = true;
        buttons.clip.textContent = 'Clipping...';
        showStatus('Extracting content...', 'success');

        try {
            const { docmostUrl } = await chrome.storage.local.get(['docmostUrl']);

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const content = await sendMessageToTab(tab.id, { action: 'get-content' });

            if (!content.success) {
                throw new Error(content.error || 'Failed to parse page content');
            }

            const pageTitle = inputs.title.value || content.data.title;
            const htmlContent = `
                <!DOCTYPE html>
                <html>
                <head><title>${pageTitle}</title></head>
                <body>
                    <p><em>Clipped from: <a href="${content.data.url}">${content.data.url}</a></em></p>
                    <hr/>
                    ${content.data.content}
                </body>
                </html>
            `;

            const blob = new Blob([htmlContent], { type: 'text/html' });
            const sanitizedTitle = pageTitle.replace(/[^a-z0-9\u00a0-\uffff\-_\s]/gi, '').trim().substring(0, 100) || 'clipped-page';
            const fileName = `${sanitizedTitle}.html`;
            const file = new File([blob], fileName, { type: 'text/html' });

            showStatus('Uploading to Docmost...', 'success');

            await importPage(docmostUrl, spaceId, file);

            showStatus('Page clipped successfully!', 'success');
            setTimeout(() => window.close(), 1500);

        } catch (err) {
            console.error(err);
            showStatus('Error: ' + err.message, 'error');
            buttons.clip.disabled = false;
            buttons.clip.textContent = 'Clip to Docmost';
        }
    });

    // --- Functions ---

    function toggleLoginState(isLoggedIn) {
        if (isLoggedIn) {
            inputs.loginForm.classList.add('hidden');
            inputs.logoutSection.classList.remove('hidden');
            inputs.url.disabled = true;
        } else {
            inputs.loginForm.classList.remove('hidden');
            inputs.logoutSection.classList.add('hidden');
            inputs.url.disabled = false;
        }
    }

    function showView(viewName) {
        views.settings.classList.add('hidden');
        views.clipper.classList.add('hidden');
        views[viewName].classList.remove('hidden');
        statusMsg.classList.add('hidden');
    }

    function showStatus(msg, type) {
        statusMsg.textContent = msg;
        statusMsg.className = type;
        statusMsg.classList.remove('hidden');
    }

    function initializeClipView() {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                inputs.title.value = tabs[0].title;
            }
        });
    }

    function populateSpaces(spaces) {
        inputs.spaceSelect.innerHTML = '<option value="" disabled selected>Select Space</option>';
        if (spaces.length > 0) {
            console.log('First space item:', spaces[0]);
        } else {
            console.warn('No spaces found or empty array.');
        }

        spaces.forEach(space => {
            const opt = document.createElement('option');
            opt.value = space.id;
            opt.textContent = space.name || space.title || space.slug || 'Unnamed Space';
            inputs.spaceSelect.appendChild(opt);
        });
    }

    async function sendMessageToTab(tabId, message) {
        try {
            return await new Promise((resolve, reject) => {
                chrome.tabs.sendMessage(tabId, message, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(response);
                    }
                });
            });
        } catch (error) {
            // If content script is missing (common after extension reload), try to inject it
            if (error.message.includes('Receiving end does not exist') || error.message.includes('Could not establish connection')) {
                console.log('Content script not found, injecting...');
                await chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    files: ['src/libs/Readability.js', 'src/content.js']
                });

                // Retry message after injection
                return new Promise((resolve, reject) => {
                    chrome.tabs.sendMessage(tabId, message, (response) => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message + ' (after injection)'));
                        } else {
                            resolve(response);
                        }
                    });
                });
            }
            throw error;
        }
    }

    // --- API Interactions ---

    async function login(baseUrl, email, password) {
        const response = await fetch(`${baseUrl}/api/auth/login`, {
            method: 'POST',
            body: JSON.stringify({ email, password }),
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Login Error ${response.status}: ${text}`);
        }
    }

    async function fetchSpaces(baseUrl, token) {
        const headers = { 'Content-Type': 'application/json' };

        const response = await fetch(`${baseUrl}/api/spaces`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ page: 1, limit: 100 }),
            credentials: 'include'
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`API Error ${response.status}: ${text}`);
        }

        const data = await response.json();
        console.log('Full API Response:', data);

        if (data.data?.data && Array.isArray(data.data.data)) return data.data.data;
        if (Array.isArray(data.data)) return data.data;
        if (Array.isArray(data)) return data;
        if (data.data?.items && Array.isArray(data.data.items)) return data.data.items;

        console.warn('Could not find array in response', data);
        return [];
    }

    async function importPage(baseUrl, spaceId, file) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('spaceId', spaceId);

        const response = await fetch(`${baseUrl}/api/pages/import`, {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Import Failed ${response.status}: ${text}`);
        }

        return await response.json();
    }
});
