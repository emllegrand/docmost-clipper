// src/content.js
console.log('Docmost Clipper Content Script Loaded');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'get-content') {
    try {
      // Use Readability to parse the document
      const documentClone = document.cloneNode(true);
      const article = new Readability(documentClone).parse();

      if (article) {
        sendResponse({
          success: true,
          data: {
            title: article.title || document.title,
            content: article.content, // HTML content
            textContent: article.textContent,
            excerpt: article.excerpt,
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
    return true; // Keep channel open for async response
  }
});
