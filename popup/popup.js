// popup/popup.js

document.addEventListener('DOMContentLoaded', async () => {
    const views = {
        settings: document.getElementById('settings-view'),
        clipper: document.getElementById('clipper-view'),
        createSpace: document.getElementById('create-space-view')
    };

    // UI Elements
    translatePage();

    const inputs = {
        url: document.getElementById('docmost-url'),
        email: document.getElementById('auth-email'),
        password: document.getElementById('auth-password'),

        title: document.getElementById('page-title'),
        spaceSelect: document.getElementById('space-select'),
        selectionGroup: document.getElementById('selection-group'),
        clipSelection: document.getElementById('clip-selection'),
        userNotes: document.getElementById('user-notes'),

        // New Space Inputs
        newSpaceName: document.getElementById('new-space-name'),
        newSpaceSlug: document.getElementById('new-space-slug'),

        loginForm: document.getElementById('login-form'),
        logoutSection: document.getElementById('logout-section'),

        retryContainer: document.getElementById('retry-container')
    };

    const buttons = {
        saveSettings: document.getElementById('save-settings'),
        disconnect: document.getElementById('disconnect-btn'),
        clip: document.getElementById('clip-btn'),
        settings: document.getElementById('settings-btn'),
        saveExitSettings: document.getElementById('save-exit-settings-btn'),
        retry: document.getElementById('retry-btn'),

        // New Space Buttons
        confirmCreateSpace: document.getElementById('confirm-create-space'),
        cancelCreateSpace: document.getElementById('cancel-create-space')
    };

    const statusMsg = document.getElementById('status-message');

    // Store content data globally for access in clip handler
    let currentContentData = null;
    let retryAction = null; // Function to call when retry button is clicked

    // Load Settings
    // Note: We no longer store 'authToken'. We rely on the browser cookie.
    const stored = await chrome.storage.local.get(['docmostUrl', 'lastSpaceId', 'theme']);

    // Apply Theme
    const currentTheme = stored.theme || 'auto';
    applyTheme(currentTheme);
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) {
        themeSelect.value = currentTheme;

        themeSelect.addEventListener('change', (e) => {
            const newTheme = e.target.value;
            applyTheme(newTheme);
            chrome.storage.local.set({ theme: newTheme });
        });
    }

    function applyTheme(theme) {
        document.body.classList.remove('dark-theme', 'light-theme');
        if (theme === 'dark') {
            document.body.classList.add('dark-theme');
        } else if (theme === 'light') {
            document.body.classList.add('light-theme');
        }
        // 'auto' does nothing, letting CSS media queries handle it
    }

    // Initialize View
    if (stored.docmostUrl) {
        inputs.url.value = stored.docmostUrl;

        // Always probe session on startup if URL is present
        // passing null as token since we don't use it anymore
        loadSpacesWithRetry(stored.docmostUrl, null, stored.lastSpaceId);
    } else {
        // No URL means definitely not logged in
        toggleLoginState(false);
    }

    // --- Helper Functions ---

    async function loadSpacesWithRetry(url, _unusedToken, lastSpaceId) {
        hideRetry();
        try {
            // We use fetchSpaces as the "Session Probe"
            const spaces = await fetchSpaces(url);

            // If we get here, session is VALID
            toggleLoginState(true);
            showView('clipper');
            populateSpaces(spaces, lastSpaceId);
            initializeClipView();
        } catch (e) {
            console.warn('Session probe failed', e);
            if (e.message.includes('401') || e.message.includes('403')) {
                // Session Invalid -> Show Login
                toggleLoginState(false);
            } else {
                // Network Error -> Allow Retry
                handleApiError(e, () => loadSpacesWithRetry(url, null, lastSpaceId));
            }
        }
    }

    function handleApiError(error, retryCallback) {
        // Status 401/403: Auth failed
        if (error.message.includes('401') || error.message.includes('403')) {
            showStatus(chrome.i18n.getMessage('statusSessionExpired'), 'error');
            toggleLoginState(false);
            showView('settings');
            return;
        }

        // Network or other errors
        showStatus(error.message || chrome.i18n.getMessage('statusNetworkError'), 'error');

        if (retryCallback) {
            retryAction = retryCallback;
            inputs.retryContainer.classList.remove('hidden');
        }
    }

    function hideRetry() {
        inputs.retryContainer.classList.add('hidden');
        retryAction = null;
    }

    // --- Event Listeners ---

    buttons.retry.addEventListener('click', () => {
        if (retryAction) {
            showStatus(chrome.i18n.getMessage('statusRetrying'), 'success');
            const action = retryAction; // Copy ref
            hideRetry(); // Hide before executing
            action();
        }
    });

    // State for security confirmation
    let pendingUrlChange = null;

    buttons.saveSettings.addEventListener('click', async () => {
        const rawUrl = inputs.url.value.trim();
        const email = inputs.email.value.trim();
        const password = inputs.password.value;

        if (!rawUrl) {
            showStatus(chrome.i18n.getMessage('errorEnterUrl'), 'error');
            return;
        }

        // Validate and Normalize URL
        let url;
        let newHostname;
        try {
            const urlObj = new URL(rawUrl);

            // Strict Protocol Check
            if (urlObj.protocol !== 'https:' && urlObj.hostname !== 'localhost' && urlObj.hostname !== '127.0.0.1') {
                showStatus(chrome.i18n.getMessage('errorHttpsRequired'), 'error');
                return;
            }

            // Path Check (Must be root)
            if (urlObj.pathname !== '/' && urlObj.pathname !== '') {
                showStatus(chrome.i18n.getMessage('errorInvalidUrlPath'), 'error');
                return;
            }

            // Normalization
            url = urlObj.origin;
            newHostname = urlObj.hostname;

        } catch (e) {
            showStatus(chrome.i18n.getMessage('errorInvalidUrlFormat'), 'error');
            return;
        }

        // Security: Host Change Warning
        // We get the stored URL again to be sure
        const freshStored = await chrome.storage.local.get(['docmostUrl']);
        if (freshStored.docmostUrl) {
            try {
                const oldUrlObj = new URL(freshStored.docmostUrl);
                if (oldUrlObj.hostname !== newHostname) {
                    if (pendingUrlChange !== newHostname) {
                        pendingUrlChange = newHostname;
                        showStatus(chrome.i18n.getMessage('warnHostChange'), 'error');
                        return; // BLOCK first attempt
                    }
                }
            } catch (e) {
                // Should not happen if stored URL was validated, but safe fallback
            }
        }
        // Reset pending if we proceed
        pendingUrlChange = null;



        if (!email || !password) {
            showStatus(chrome.i18n.getMessage('errorEnterEmail'), 'error');
            return;
        }

        buttons.saveSettings.disabled = true;
        buttons.saveSettings.textContent = chrome.i18n.getMessage('statusConnecting');
        showStatus(chrome.i18n.getMessage('statusConnecting'), 'success');
        hideRetry();

        try {
            await login(url, email, password);

            // Verify session immediately by fetching spaces
            const spaces = await fetchSpaces(url);

            // SAVE ONLY URL (No fake token)
            await chrome.storage.local.set({
                docmostUrl: url
            });

            toggleLoginState(true);
            showView('clipper');
            populateSpaces(spaces);
            showStatus(chrome.i18n.getMessage('statusConnected'), 'success');
            initializeClipView();

        } catch (err) {
            console.error(err);
            if (err.message.includes('Login Error') || err.message.includes('401')) {
                showStatus(chrome.i18n.getMessage('errorLoginFailed'), 'error');
            } else {
                handleApiError(err, () => buttons.saveSettings.click());
            }
        } finally {
            buttons.saveSettings.disabled = false;
            buttons.saveSettings.textContent = chrome.i18n.getMessage('btnConnect');
        }
    });

    buttons.disconnect.addEventListener('click', async () => {
        await chrome.storage.local.remove('authToken');
        toggleLoginState(false);
        inputs.email.value = '';
        inputs.password.value = '';
        showStatus(chrome.i18n.getMessage('statusDisconnected'), 'success');
        hideRetry();
    });

    buttons.settings.addEventListener('click', () => {
        showView('settings');
        hideRetry();
    });

    if (buttons.saveExitSettings) {
        buttons.saveExitSettings.addEventListener('click', async () => {
            // Explicitly save the current theme value
            const themeSelect = document.getElementById('theme-select');
            if (themeSelect) {
                const selectedTheme = themeSelect.value;
                await chrome.storage.local.set({ theme: selectedTheme });
                applyTheme(selectedTheme);
            }
            showView('clipper');
            // If we are disconnected, Clipper view might be empty? 
            // Usually valid flow but let's clear connection errors
            statusMsg.classList.add('hidden');
        });
    }

    // Space Selection Change Listener (for New Space)
    inputs.spaceSelect.addEventListener('change', (e) => {
        if (e.target.value === '__NEW_SPACE__') {
            showView('createSpace');
            inputs.newSpaceName.value = '';
            inputs.newSpaceSlug.textContent = '';
            inputs.newSpaceName.focus();
        }
    });

    // New Space Name Input Listener (Auto-slug)
    inputs.newSpaceName.addEventListener('input', (e) => {
        const name = e.target.value;
        const slug = name.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphen
            .replace(/^-+|-+$/g, '');   // Trim hyphens
        inputs.newSpaceSlug.textContent = slug;
    });

    // Cancel Create Space
    buttons.cancelCreateSpace.addEventListener('click', () => {
        showView('clipper');
        // Reset selection to previous valid one or default
        // For simplicity, just reset to empty or last stored
        chrome.storage.local.get(['lastSpaceId']).then((stored) => {
            if (stored.lastSpaceId) {
                inputs.spaceSelect.value = stored.lastSpaceId;
            } else {
                inputs.spaceSelect.value = "";
            }
            // If reset value is still new space (e.g. if last was null), select first option
            if (inputs.spaceSelect.value === '__NEW_SPACE__') {
                inputs.spaceSelect.selectedIndex = 0;
            }
        });
    });

    // Confirm Create Space
    buttons.confirmCreateSpace.addEventListener('click', async () => {
        const name = inputs.newSpaceName.value.trim();
        const slug = inputs.newSpaceSlug.textContent;

        if (!name || name.length < 2) {
            showStatus(chrome.i18n.getMessage('errorNameLength'), 'error');
            return;
        }

        buttons.confirmCreateSpace.disabled = true;
        buttons.confirmCreateSpace.textContent = chrome.i18n.getMessage('statusCreating');
        hideRetry();

        try {
            const { docmostUrl } = await chrome.storage.local.get(['docmostUrl']);

            // Create Space
            await createSpace(docmostUrl, name, slug);

            // Refresh Spaces
            const spaces = await fetchSpaces(docmostUrl);

            // Update UI
            showView('clipper');

            // Populate and Select New Space
            // We need to find the space with the slug we just created
            const newSpace = spaces.find(s => s.slug === slug);
            populateSpaces(spaces, newSpace ? newSpace.id : null);

            showStatus(chrome.i18n.getMessage('statusSpaceCreated'), 'success');

        } catch (err) {
            console.error(err);
            handleApiError(err, () => buttons.confirmCreateSpace.click());
        } finally {
            buttons.confirmCreateSpace.disabled = false;
            buttons.confirmCreateSpace.textContent = chrome.i18n.getMessage('btnCreateSpace');
        }
    });


    buttons.clip.addEventListener('click', async () => {
        const spaceId = inputs.spaceSelect.value;
        if (!spaceId || spaceId === '__NEW_SPACE__') {
            showStatus(chrome.i18n.getMessage('errorSelectSpace'), 'error');
            return;
        }

        if (!currentContentData) {
            showStatus(chrome.i18n.getMessage('errorNoContent'), 'error');
            return;
        }

        buttons.clip.disabled = true;
        buttons.clip.textContent = chrome.i18n.getMessage('statusClipping');
        showStatus(chrome.i18n.getMessage('statusExtracting'), 'success');
        hideRetry();

        try {
            const { docmostUrl } = await chrome.storage.local.get(['docmostUrl']);

            const pageTitle = inputs.title.value || currentContentData.title;
            const userNote = inputs.userNotes.value.trim();

            // Determine content source (Selection or Full Page)
            const useSelection = inputs.clipSelection && inputs.clipSelection.checked;
            const bodyContent = useSelection ? currentContentData.selection : currentContentData.content;
            const sourceUrl = currentContentData.url;

            let finalHtmlBody = '';

            // Security: Escape User Inputs
            const safeUserNote = escapeHtml(userNote);
            const safeSourceUrl = escapeHtml(sourceUrl);
            const safeTitle = escapeHtml(pageTitle);

            if (userNote) {
                finalHtmlBody += `
                    <blockquote style="background: #f0f4f8; border-left: 4px solid #0969da; padding: 12px; margin-bottom: 24px; color: #24292f; font-style: italic;">
                        <strong>Note:</strong> ${safeUserNote.replace(/\n/g, '<br>')}
                    </blockquote>
                `;
            }

            finalHtmlBody += `
                <p><em>Clipped from: <a href="${safeSourceUrl}">${safeSourceUrl}</a></em></p>
                <hr/>
                ${bodyContent}
            `;

            const htmlContent = `
                <!DOCTYPE html>
                <html>
                <head><title>${safeTitle}</title></head>
                <body>
                    ${finalHtmlBody}
                </body>
                </html>
            `;

            const blob = new Blob([htmlContent], { type: 'text/html' });
            const sanitizedTitle = pageTitle.replace(/[^a-z0-9\u00a0-\uffff\-_\s]/gi, '').trim().substring(0, 100) || 'clipped-page';
            const fileName = `${sanitizedTitle}.html`;
            const file = new File([blob], fileName, { type: 'text/html' });

            showStatus(chrome.i18n.getMessage('statusUploading'), 'success');

            await importPage(docmostUrl, spaceId, file);

            // Save the last used space ID
            await chrome.storage.local.set({ lastSpaceId: spaceId });

            showStatus(chrome.i18n.getMessage('statusClipped'), 'success');
            setTimeout(() => window.close(), 1500);

        } catch (err) {
            console.error(err);
            // Allow retry of clip
            handleApiError(err, () => buttons.clip.click());
            buttons.clip.disabled = false;
            buttons.clip.textContent = chrome.i18n.getMessage('btnClip');
        }
    });

    // --- Helper Utils ---

    function translatePage() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const message = chrome.i18n.getMessage(key);
            if (message) el.textContent = message;
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            const message = chrome.i18n.getMessage(key);
            if (message) el.placeholder = message;
        });
    }

    function escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // --- Functions ---

    function toggleLoginState(isLoggedIn) {
        if (isLoggedIn) {
            inputs.loginForm.classList.add('hidden');
            inputs.logoutSection.classList.remove('hidden');
            if (buttons.disconnect) buttons.disconnect.classList.remove('hidden');
            inputs.url.disabled = true;
        } else {
            inputs.loginForm.classList.remove('hidden');
            inputs.logoutSection.classList.add('hidden');
            if (buttons.disconnect) buttons.disconnect.classList.add('hidden');
            inputs.url.disabled = false;
        }
    }

    function showView(viewName) {
        Object.values(views).forEach(el => el && el.classList.add('hidden'));
        if (views[viewName]) {
            views[viewName].classList.remove('hidden');
        }
        statusMsg.classList.add('hidden');
    }

    function showStatus(msg, type) {
        statusMsg.textContent = msg;
        statusMsg.className = type;
        statusMsg.classList.remove('hidden');
    }

    function initializeClipView() {
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            if (tabs[0]) {
                const response = await sendMessageToTab(tabs[0].id, { action: 'get-content' });

                if (response && response.success) {
                    currentContentData = response.data;
                    inputs.title.value = currentContentData.title;

                    // Handle Selection Toggle
                    if (currentContentData.selection && currentContentData.selection.trim().length > 0) {
                        inputs.selectionGroup.classList.remove('hidden');
                        inputs.clipSelection.checked = true; // Default to checked if selection exists
                    } else {
                        inputs.selectionGroup.classList.add('hidden');
                        inputs.clipSelection.checked = false;
                    }

                } else {
                    // Handle error fetching content
                }
            }
        });
    }

    function populateSpaces(spaces, selectedId = null) {
        inputs.spaceSelect.innerHTML = `<option value="" disabled selected>${chrome.i18n.getMessage('optSelectSpace')}</option>`;

        // Add Create New Option
        const newSpaceOpt = document.createElement('option');
        newSpaceOpt.value = '__NEW_SPACE__';
        newSpaceOpt.textContent = chrome.i18n.getMessage('optCreateNewSpace');
        newSpaceOpt.style.fontWeight = 'bold';
        inputs.spaceSelect.appendChild(newSpaceOpt);

        const separator = document.createElement('option');
        separator.disabled = true;
        separator.textContent = '----------------';
        inputs.spaceSelect.appendChild(separator);

        spaces.forEach(space => {
            const opt = document.createElement('option');
            opt.value = space.id;
            opt.textContent = space.name || space.title || space.slug || chrome.i18n.getMessage('optUnnamedSpace');
            if (selectedId && space.id === selectedId) {
                opt.selected = true;
            }
            inputs.spaceSelect.appendChild(opt);
        });

        if (selectedId) {
            inputs.spaceSelect.value = selectedId;
        }
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
            if (error.message.includes('Receiving end does not exist') || error.message.includes('Could not establish connection')) {
                console.log('Content script not found, injecting...');
                await chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    files: ['src/libs/Readability.js', 'src/content.js']
                });

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

    async function getAntiCsrfHeaders(baseUrl) {
        const headers = {};
        if (!chrome.cookies) return headers;

        try {
            // Standard "Double Submit Cookie" patterns
            const candidates = [
                { cookie: 'XSRF-TOKEN', header: 'X-XSRF-TOKEN' },
                { cookie: 'csrf_token', header: 'X-CSRF-Token' },
                { cookie: '_csrf', header: 'X-CSRF-Token' }
            ];

            for (const c of candidates) {
                const cookie = await chrome.cookies.get({ url: baseUrl, name: c.cookie });
                if (cookie) {
                    headers[c.header] = cookie.value;
                    // Usually we only need one. Break after found.
                    break;
                }
            }
        } catch (e) {
            console.warn('CSRF header generation failed', e);
        }
        return headers;
    }

    async function login(baseUrl, email, password) {
        const csrfHeaders = await getAntiCsrfHeaders(baseUrl);
        const headers = {
            'Content-Type': 'application/json',
            ...csrfHeaders
        };

        const response = await fetch(`${baseUrl}/api/auth/login`, {
            method: 'POST',
            body: JSON.stringify({ email, password }),
            headers: headers,
            credentials: 'include'
        }).catch(err => { throw new Error('Network Error: ' + err.message); });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Login Error ${response.status}: ${text}`);
        }
    }

    async function fetchSpaces(baseUrl, token) {
        const csrfHeaders = await getAntiCsrfHeaders(baseUrl);
        const headers = {
            'Content-Type': 'application/json',
            ...csrfHeaders
        };

        const response = await fetch(`${baseUrl}/api/spaces`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ page: 1, limit: 100 }),
            credentials: 'include'
        }).catch(err => { throw new Error('Network Error: ' + err.message); });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`API Error ${response.status}: ${text}`);
        }

        const data = await response.json();

        if (data.data?.data && Array.isArray(data.data.data)) return data.data.data;
        if (Array.isArray(data.data)) return data.data;
        if (Array.isArray(data)) return data;
        if (data.data?.items && Array.isArray(data.data.items)) return data.data.items;

        return [];
    }

    async function createSpace(baseUrl, name, slug) {
        const csrfHeaders = await getAntiCsrfHeaders(baseUrl);
        const headers = {
            'Content-Type': 'application/json',
            ...csrfHeaders
        };

        const response = await fetch(`${baseUrl}/api/spaces/create`, {
            method: 'POST',
            body: JSON.stringify({ name, slug }),
            headers: headers,
            credentials: 'include'
        }).catch(err => { throw new Error('Network Error: ' + err.message); });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Create Space Failed ${response.status}: ${text}`);
        }

        return await response.json();
    }

    async function importPage(baseUrl, spaceId, file) {
        const formData = new FormData();
        // Append text fields FIRST for better streaming parser compatibility
        formData.append('spaceId', spaceId);
        formData.append('file', file);

        // Note: FormData checks do not need explicit Content-Type, browser sets it with boundary
        // But we DO need the CSRF header
        const csrfHeaders = await getAntiCsrfHeaders(baseUrl);

        const response = await fetch(`${baseUrl}/api/pages/import`, {
            method: 'POST',
            body: formData,
            headers: csrfHeaders,
            credentials: 'include'
        }).catch(err => { throw new Error('Network Error: ' + err.message); });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Import Failed ${response.status}: ${text}`);
        }

        return await response.json();
    }
});
