export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OpenAI API key not configured' });

  const { title, selftext, comments } = req.body;
  if (!title) return res.status(400).json({ error: 'Missing title' });

  const comTxt = (comments || [])
    .slice(0, 5)
    .map(c => `[▲${c.ups}${c.type === 'funny' ? ' FUNNY' : ''}] ${(c.body || '').slice(0, 180)}`)
    .join('\n');

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        max_tokens: 400,
        messages: [
          {
            role: 'system',
            content: 'You are a crisp, witty news digest assistant. Write like a smart friend over coffee. ALWAYS include funny high-upvote comments if present.',
          },
          {
            role: 'user',
            content: `Reddit post + comments. Give me:
1. "summary": 2 tight sentences. What happened & why it matters.
2. "commentDigest": exactly 3 items [{type,text}]. type=funny|insight|counter|expert|hot. Include funny+high-upvote ones! Each text 1-2 sentences max.
3. "talkingPoint": 1 casual sentence for office water cooler. Sound natural.

Title: ${title}
Body: ${(selftext || '').slice(0, 300) || '(link post)'}
Comments:\n${comTxt}

RESPOND ONLY VALID JSON. No markdown, no backticks.`,
          },
        ],
      }),
    });

    const d = await r.json();
    if (d.error) return res.status(500).json({ error: d.error.message || 'OpenAI error' });

    const text = d.choices?.[0]?.message?.content || '';
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=120');
    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to generate summary' });
  }
}
