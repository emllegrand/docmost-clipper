// src/content.js
console.log('Docmost Clipper Content Script Loaded');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'get-content') {
        try {
            // Use Readability to parse the document
            const documentClone = document.cloneNode(true);
            // Check for user selection
            let selectionHtml = '';
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
                const container = document.createElement('div');
                for (let i = 0; i < selection.rangeCount; i++) {
                    container.appendChild(selection.getRangeAt(i).cloneContents());
                }
                // Sanitize the raw selection
                selectionHtml = sanitizeHtml(container.innerHTML);
            }

            const article = new Readability(documentClone).parse();

            if (article || selectionHtml) {
                sendResponse({
                    success: true,
                    data: {
                        title: article ? (article.title || document.title) : document.title,
                        content: article ? article.content : '', // Readability sanitizes internally
                        textContent: article ? article.textContent : '',
                        excerpt: article ? article.excerpt : '',
                        selection: selectionHtml,
                        url: window.location.href
                    }
                });
            } else {
                sendResponse({ success: false, error: 'Could not parse page content' });
            }
        } catch (error) {
            console.error('Docmost Clipper: Error parsing page', error);
            sendResponse({ success: false, error: error.message });
        }
        return true;
    }
});

/**
 * Lightweight Sanitizer to strip scripts and dangerous attributes
 * To prevent Stored XSS if the user selects malicious content
 */
function sanitizeHtml(htmlString) {
    if (!htmlString) return '';

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');

    // 1. Remove dangerous tags
    const badTags = ['script', 'iframe', 'object', 'embed', 'form', 'style', 'meta', 'link'];
    badTags.forEach(tag => {
        const elements = doc.querySelectorAll(tag);
        elements.forEach(el => el.remove());
    });

    // 2. Remove event handlers (on*) and javascript: urls
    const allElements = doc.body.querySelectorAll('*');
    allElements.forEach(el => {
        const attributes = Array.from(el.attributes);
        attributes.forEach(attr => {
            // Remove onClick, onError, etc.
            if (attr.name.toLowerCase().startsWith('on')) {
                el.removeAttribute(attr.name);
            }
            // Remove javascript: href/src
            if ((attr.name === 'href' || attr.name === 'src') &&
                attr.value.toLowerCase().includes('javascript:')) {
                el.removeAttribute(attr.name);
            }
        });
    });

    return doc.body.innerHTML;
}
