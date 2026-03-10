export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { sub, sort, t, limit, id } = req.query;
  if (!sub) return res.status(400).json({ error: 'Missing sub parameter' });

  const lim = limit || 10;
  const srt = sort || 'top';
  const time = t || 'day';

  // Build URLs for different Reddit domains
  const buildUrl = (domain) => {
    if (id) {
      return `https://${domain}/r/${sub}/comments/${id}.json?sort=${srt}&limit=${lim}&raw_json=1`;
    }
    return `https://${domain}/r/${sub}/${srt}.json?t=${time}&limit=${lim}&raw_json=1`;
  };

  // Try multiple Reddit domains with browser-like headers
  const domains = ['old.reddit.com', 'www.reddit.com', 'api.reddit.com'];
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'WaterCoolerApp/2.0 (personal news digest; contact@example.com)',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  ];

  for (let i = 0; i < domains.length; i++) {
    try {
      const url = buildUrl(domains[i]);
      const response = await fetch(url, {
        headers: {
          'User-Agent': userAgents[i],
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
        },
        redirect: 'follow',
      });

      if (response.ok) {
        const text = await response.text();
        try {
          const data = JSON.parse(text);
          res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
          return res.status(200).json(data);
        } catch {
          continue;
        }
      }
    } catch {
      continue;
    }
  }

  // Fallback: try RSS feed and convert to Reddit-like JSON
  if (!id) {
    try {
      const rssUrl = `https://www.reddit.com/r/${sub}/${srt}.rss?t=${time}&limit=${lim}`;
      const rssRes = await fetch(rssUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Accept': 'application/rss+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      if (rssRes.ok) {
        const rssText = await rssRes.text();
        const entries = [];
        const regex = /<entry>([\s\S]*?)<\/entry>/g;
        let m;
        while ((m = regex.exec(rssText)) !== null) {
          const e = m[1];
          const decode = s => s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'").replace(/&quot;/g,'"');
          const title = decode(e.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '');
          const link = e.match(/<link href="([^"]*)"/)?.[1] || '';
          const rawId = e.match(/<id>([\s\S]*?)<\/id>/)?.[1] || '';
          const postId = rawId.split('/').pop()?.replace('t3_','') || Math.random().toString(36).slice(2,10);
          const updated = e.match(/<updated>([\s\S]*?)<\/updated>/)?.[1] || '';
          const ts = updated ? Math.floor(new Date(updated).getTime() / 1000) : Math.floor(Date.now() / 1000);

          if (title) {
            entries.push({
              kind: 't3',
              data: {
                id: postId,
                title,
                permalink: link.replace('https://www.reddit.com', ''),
                url: link,
                ups: 100,
                num_comments: 10,
                created_utc: ts,
                selftext: '',
                stickied: false,
                subreddit: sub,
              }
            });
          }
        }

        if (entries.length > 0) {
          res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
          return res.status(200).json({ data: { children: entries } });
        }
      }
    } catch {
      // RSS also failed
    }
  }

  return res.status(502).json({ error: 'Reddit is temporarily unavailable. Try again in a few minutes.' });
}
