export default async function handler(req, res) {
  // Allow CORS from any origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { sub, sort, t, limit, id } = req.query;

  if (!sub) {
    return res.status(400).json({ error: 'Missing "sub" parameter' });
  }

  let url;
  if (id) {
    // Fetch comments for a specific post
    url = `https://www.reddit.com/r/${sub}/comments/${id}.json?sort=${sort || 'top'}&limit=${limit || 15}`;
  } else {
    // Fetch top posts
    url = `https://www.reddit.com/r/${sub}/${sort || 'top'}.json?t=${t || 'day'}&limit=${limit || 10}`;
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'WaterCoolerApp/1.0 (news digest)',
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Reddit returned ${response.status}` });
    }

    const data = await response.json();
    // Cache for 5 minutes to avoid hitting Reddit rate limits
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch from Reddit' });
  }
}
