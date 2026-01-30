exports.handler = async (event) => {
    const headers = {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
          return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
          return {
                  statusCode: 405,
                  headers,
                  body: JSON.stringify({ error: 'Method not allowed' })
          };
    }

    try {
          const { apiKey, bags } = JSON.parse(event.body);
          const promptText = 'You are a fashion consultant specializing in handbags and accessories. Analyze this bag collection and provide: 1. A brief overview of the collection (2-3 sentences) 2. Identified gaps (what is missing - be specific about bag types, colors, or occasions) 3. Bags that might be outdated or worn (if visible in images) 4. 3-4 specific recommendations for bags to add. Format your response as JSON with this structure: {"overview": "string", "gaps": ["gap1", "gap2", "gap3"], "outdated": ["concern1", "concern2"], "recommendations": [{"type": "string", "reason": "string", "priority": "high/medium/low"}]}. Be constructive, specific, and focus on building a versatile collection.';
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

      const data = await response.json();
          return {
                  statusCode: 200,
                  headers,
                  body: JSON.stringify(data)
          };
    } catch (error) {
          return {
                  statusCode: 500,
                  headers,
                  body: JSON.stringify({ error: error.message })
          };
    }
};
