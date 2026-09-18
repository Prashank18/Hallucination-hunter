// /api/search.js - Find real source URLs by searching the web
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { query } = req.body || {};
  if (!query) return res.status(400).json({ error: 'No query' });

  try {
    // Search DuckDuckGo for the claim
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query + ' fact')}`;
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const html = await response.text();

    // Parse first few result URLs from DuckDuckGo HTML
    const results = [];
    const linkRegex = /class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)/g;
    let match;
    while ((match = linkRegex.exec(html)) !== null && results.length < 3) {
      let url = match[1];
      const title = match[2].trim();
      
      // DuckDuckGo wraps URLs in redirects, extract actual URL
      if (url.includes('uddg=')) {
        url = decodeURIComponent(url.split('uddg=')[1].split('&')[0]);
      }
      
      // Skip ad/tracking URLs
      if (url.startsWith('http') && !url.includes('duckduckgo.com')) {
        results.push({ url, title });
      }
    }

    // If regex didn't work, try alternate pattern
    if (results.length === 0) {
      const altRegex = /href="\/\/duckduckgo\.com\/l\/\?uddg=([^&"]+)/g;
      while ((match = altRegex.exec(html)) !== null && results.length < 3) {
        const url = decodeURIComponent(match[1]);
        if (url.startsWith('http')) {
          results.push({ url, title: '' });
        }
      }
    }

    res.status(200).json({ results });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: err.message, results: [] });
  }
}
