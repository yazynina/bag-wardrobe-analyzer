export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { apiKey, bags } = req.body;

  const promptText = 'You are a fashion consultant specializing in handbags and accessories. Analyze this bag collection and provide: 1. A brief overview of the collection (2-3 sentences) 2. Identified gaps (what is missing - be specific about bag types, colors, or occasions) 3. Bags that might be outdated or worn (if visible in images) 4. 3-4 specific recommendations for bags to add. Format your response as JSON with this structure: {"overview": "string", "gaps": ["gap1", "gap2", "gap3"], "outdated": ["concern1", "concern2"], "recommendations": [{"type": "string", "reason": "string", "priority": "high/medium/low"}]}. Be constructive, specific, and focus on building a versatile collection.';

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: promptText },
              ...bags.map(bag => ({
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/jpeg",
                  data: bag.image.split(',')[1]
                }
              }))
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      return res.status(response.status).json(errorData);
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
