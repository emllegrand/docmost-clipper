// popup/popup.js

document.addEventListener('DOMContentLoaded', async () => {
    const views = {
        settings: document.getElementById('settings-view'),
        clipper: document.getElementById('clipper-view'),
        createSpace: document.getElementById('create-space-view')
    };

    // UI Elements
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
        logoutSection: document.getElementById('logout-section')
    };

    const buttons = {
        saveSettings: document.getElementById('save-settings'),
        disconnect: document.getElementById('disconnect-btn'),
        clip: document.getElementById('clip-btn'),
        settings: document.getElementById('settings-btn'),
        saveExitSettings: document.getElementById('save-exit-settings-btn'),

        // New Space Buttons
        confirmCreateSpace: document.getElementById('confirm-create-space'),
        cancelCreateSpace: document.getElementById('cancel-create-space')
    };

    const statusMsg = document.getElementById('status-message');

    // Store content data globally for access in clip handler
    let currentContentData = null;

    // Load Settings
    const stored = await chrome.storage.local.get(['docmostUrl', 'authToken', 'lastSpaceId', 'theme']);

    // Apply Theme
    const currentTheme = stored.theme || 'auto';
    applyTheme(currentTheme);
    // Set selector value if element exists (might need check if view is rendered, but it is static html)
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

        if (stored.authToken) {
            toggleLoginState(true);

            // Try explicit auto-login/fetch spaces
            try {
                const spaces = await fetchSpaces(stored.docmostUrl, stored.authToken);
                showView('clipper');
                populateSpaces(spaces, stored.lastSpaceId);
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
        const rawUrl = inputs.url.value.trim();
        const email = inputs.email.value.trim();
        const password = inputs.password.value;

        if (!rawUrl) {
            showStatus('Please enter Docmost URL.', 'error');
            return;
        }

        // Validate and Normalize URL
        let url;
        try {
            const urlObj = new URL(rawUrl);

            // Strict Protocol Check
            if (urlObj.protocol !== 'https:' && urlObj.hostname !== 'localhost' && urlObj.hostname !== '127.0.0.1') {
                showStatus('Security Error: HTTPS is required.', 'error');
                return;
            }

            // Path Check (Must be root)
            if (urlObj.pathname !== '/' && urlObj.pathname !== '') {
                showStatus('Invalid URL: Please remove paths (e.g. /api) and use the root URL.', 'error');
                return;
            }

            // Normalization (removes trailing slash automatically via origin)
            url = urlObj.origin;

        } catch (e) {
            showStatus('Invalid URL format. Include http:// or https://', 'error');
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
            buttons.saveSettings.textContent = 'Connect';
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
            showStatus('Name must be at least 2 characters.', 'error');
            return;
        }

        buttons.confirmCreateSpace.disabled = true;
        buttons.confirmCreateSpace.textContent = 'Creating...';

        try {
            const { docmostUrl } = await chrome.storage.local.get(['docmostUrl']);

            // Create Space
            const newSpaceResponse = await createSpace(docmostUrl, name, slug);

            // Refresh Spaces
            const spaces = await fetchSpaces(docmostUrl);

            // Update UI
            showView('clipper');

            // Populate and Select New Space
            // We need to find the space with the slug we just created
            const newSpace = spaces.find(s => s.slug === slug);
            populateSpaces(spaces, newSpace ? newSpace.id : null);

            showStatus(`Space "${name}" created!`, 'success');

        } catch (err) {
            console.error(err);
            showStatus('Failed to create space: ' + err.message, 'error');
        } finally {
            buttons.confirmCreateSpace.disabled = false;
            buttons.confirmCreateSpace.textContent = 'Create Space';
        }
    });


    buttons.clip.addEventListener('click', async () => {
        const spaceId = inputs.spaceSelect.value;
        if (!spaceId || spaceId === '__NEW_SPACE__') {
            showStatus('Please select a Space.', 'error');
            return;
        }

        if (!currentContentData) {
            showStatus('No content loaded. Please retry.', 'error');
            return;
        }

        buttons.clip.disabled = true;
        buttons.clip.textContent = 'Clipping...';
        showStatus('Extracting content...', 'success');

        try {
            const { docmostUrl } = await chrome.storage.local.get(['docmostUrl']);

            const pageTitle = inputs.title.value || currentContentData.title;
            const userNote = inputs.userNotes.value.trim();

            // Determine content source (Selection or Full Page)
            const useSelection = inputs.clipSelection && inputs.clipSelection.checked;
            const bodyContent = useSelection ? currentContentData.selection : currentContentData.content;
            const sourceUrl = currentContentData.url;

            let finalHtmlBody = '';

            if (userNote) {
                finalHtmlBody += `
                    <blockquote style="background: #f0f4f8; border-left: 4px solid #0969da; padding: 12px; margin-bottom: 24px; color: #24292f; font-style: italic;">
                        <strong>Note:</strong> ${userNote.replace(/\n/g, '<br>')}
                    </blockquote>
                `;
            }

            finalHtmlBody += `
                <p><em>Clipped from: <a href="${sourceUrl}">${sourceUrl}</a></em></p>
                <hr/>
                ${bodyContent}
            `;

            const htmlContent = `
                <!DOCTYPE html>
                <html>
                <head><title>${pageTitle}</title></head>
                <body>
                    ${finalHtmlBody}
                </body>
                </html>
            `;

            const blob = new Blob([htmlContent], { type: 'text/html' });
            const sanitizedTitle = pageTitle.replace(/[^a-z0-9\u00a0-\uffff\-_\s]/gi, '').trim().substring(0, 100) || 'clipped-page';
            const fileName = `${sanitizedTitle}.html`;
            const file = new File([blob], fileName, { type: 'text/html' });

            showStatus('Uploading to Docmost...', 'success');

            await importPage(docmostUrl, spaceId, file);

            // Save the last used space ID
            await chrome.storage.local.set({ lastSpaceId: spaceId });

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
        inputs.spaceSelect.innerHTML = '<option value="" disabled selected>Select Space</option>';

        // Add Create New Option
        const newSpaceOpt = document.createElement('option');
        newSpaceOpt.value = '__NEW_SPACE__';
        newSpaceOpt.textContent = '+ Create New Space';
        newSpaceOpt.style.fontWeight = 'bold';
        inputs.spaceSelect.appendChild(newSpaceOpt);

        const separator = document.createElement('option');
        separator.disabled = true;
        separator.textContent = '----------------';
        inputs.spaceSelect.appendChild(separator);

        spaces.forEach(space => {
            const opt = document.createElement('option');
            opt.value = space.id;
            opt.textContent = space.name || space.title || space.slug || 'Unnamed Space';
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

        if (data.data?.data && Array.isArray(data.data.data)) return data.data.data;
        if (Array.isArray(data.data)) return data.data;
        if (Array.isArray(data)) return data;
        if (data.data?.items && Array.isArray(data.data.items)) return data.data.items;

        return [];
    }

    async function createSpace(baseUrl, name, slug) {
        const response = await fetch(`${baseUrl}/api/spaces/create`, {
            method: 'POST',
            body: JSON.stringify({ name, slug }),
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        });

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
