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

    const { apiKey, query } = req.body;

    if (!apiKey || !query) {
              return res.status(400).json({ error: 'Missing apiKey or query' });
    }

    try {
              // Use Claude to extract the best keywords for image search
          const response = await fetch("https://api.anthropic.com/v1/messages", {
                        method: "POST",
                        headers: {
                                          "Content-Type": "application/json",
                                          "x-api-key": apiKey,
                                          "anthropic-version": "2023-06-01"
                        },
                        body: JSON.stringify({
                                          model: "claude-sonnet-4-20250514",
                                          max_tokens: 300,
                                          messages: [
                                            {
                                                                      role: "user",
                                                                      content: `For the handbag search query: "${query}"

                                                                      Extract 2-3 simple keywords that best describe this bag for an image search (e.g., "black tote leather", "gold clutch evening"). Also suggest a specific well-known brand + model name.

                                                                      Return ONLY JSON, no other text:
                                                                      {"keywords": "keyword1 keyword2 keyword3", "brandModel": "Brand ModelName", "color": "main color", "style": "bag style like tote/clutch/crossbody/shoulder"}`
                                            }
                                                            ]
                        })
          });

          if (!response.ok) {
                        return res.status(200).json({ images: generateFallbackImages(query) });
          }

          const data = await response.json();
              const text = data.content.find(c => c.type === 'text')?.text || '';
              const jsonMatch = text.match(/\{[\s\S]*\}/);

          let keywords = query.replace(/\s+/g, ',');
              let brandModel = '';

          if (jsonMatch) {
                        try {
                                          const parsed = JSON.parse(jsonMatch[0]);
                                          keywords = (parsed.keywords || query).replace(/\s+/g, ',');
                                          brandModel = parsed.brandModel || '';
                        } catch (e) {
                                          // Use defaults
                        }
          }

          // Generate multiple image URLs using free image services
          const images = [
            {
                              url: `https://loremflickr.com/400/300/${encodeURIComponent(keywords)}/all?random=${Date.now()}`,
                              alt: query,
                              source: 'loremflickr'
            },
            {
                              url: `https://loremflickr.com/400/300/${encodeURIComponent(keywords)}/all?random=${Date.now() + 1}`,
                              alt: query,
                              source: 'loremflickr'
            },
            {
                              url: `https://loremflickr.com/400/300/${encodeURIComponent(keywords)}/all?random=${Date.now() + 2}`,
                              alt: query,
                              source: 'loremflickr'
            }
                    ];

          return res.status(200).json({ images, brandModel });
    } catch (error) {
              return res.status(200).json({ images: generateFallbackImages(query) });
    }
}

function generateFallbackImages(query) {
      const keywords = query.replace(/\s+/g, ',');
      return [
        {
                      url: `https://loremflickr.com/400/300/${encodeURIComponent(keywords)}/all?random=1`,
                      alt: query,
                      source: 'loremflickr'
        },
        {
                      url: `https://loremflickr.com/400/300/${encodeURIComponent(keywords)}/all?random=2`,
                      alt: query,
                      source: 'loremflickr'
        },
        {
                      url: `https://loremflickr.com/400/300/${encodeURIComponent(keywords)}/all?random=3`,
                      alt: query,
                      source: 'loremflickr'
        }
            ];
}
