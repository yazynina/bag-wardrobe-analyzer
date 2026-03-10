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
                                                                                              content: `You are a luxury fashion shopping expert. For the following bag description, suggest 4 specific real products from luxury fashion retailers that match this description.

                                                                                              Bag description: "${query}"

                                                                                              For each product, provide:
                                                                                              1. The exact product name as it would appear on a retailer site
                                                                                              2. The brand name
                                                                                              3. An estimated price range
                                                                                              4. A direct search URL on one of these retailers: net-a-porter.com, farfetch.com, ssense.com, luisaviaroma.com, matchesfashion.com
                                                                                              5. A Google Images search URL to find the product image

                                                                                              Use these URL formats for retailer search pages:
                                                                                              - Net-a-Porter: https://www.net-a-porter.com/en-us/shop/search/{search+terms}
                                                                                              - Farfetch: https://www.farfetch.com/shopping/women/search/items.aspx?q={search+terms}
                                                                                              - SSENSE: https://www.ssense.com/en-us/women/search?q={search+terms}
                                                                                              - Luisaviaroma: https://www.luisaviaroma.com/en-us/search?q={search+terms}
                                                                                              - Matches Fashion: https://www.matchesfashion.com/us/search?q={search+terms}

                                                                                              Return ONLY a valid JSON array, no other text:
                                                                                              [
                                                                                                {
                                                                                                    "name": "Product Name",
                                                                                                        "brand": "Brand Name",
                                                                                                            "price": "$XXX - $XXX",
                                                                                                                "retailer": "Retailer Name",
                                                                                                                    "retailerUrl": "direct search URL on retailer",
                                                                                                                        "imageSearchUrl": "https://www.google.com/search?tbm=isch&q=brand+product+name+bag",
                                                                                                                            "retailerLogo": "retailer name lowercase"
                                                                                                                              }
                                                                                                                              ]
                                                                                                                              
                                                                                                                              Suggest products from at least 3 different retailers. Make sure the search URLs use proper URL encoding with + for spaces.`
                                                                }
                                                                                ]
                                    })
                  });

              if (!response.ok) {
                                return res.status(200).json({ products: [], images: [] });
              }

              const data = await response.json();
                  const text = data.content.find(c => c.type === 'text')?.text || '';
                  const jsonMatch = text.match(/\[[\s\S]*\]/);

              if (jsonMatch) {
                                const products = JSON.parse(jsonMatch[0]);
                                return res.status(200).json({ products, images: [] });
              }

              return res.status(200).json({ products: [], images: [] });
    } catch (error) {
                  return res.status(200).json({ products: [], images: [], error: error.message });
    }
}
