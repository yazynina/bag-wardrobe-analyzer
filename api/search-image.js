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
                                                                      max_tokens: 1500,
                                                                      messages: [
                                                                                {
                                                                                                                  role: "user",
                                                                                                                  content: `You are a luxury fashion shopping expert. For the following bag description, suggest 5-6 specific real products that match this description. Prioritize products from the brand's own official website when possible, and also include multi-brand retailers.
                                                                                                                  
                                                                                                                  Bag description: "${query}"
                                                                                                                  
                                                                                                                  BRAND WEBSITE DIRECTORY - Use these official brand URLs for direct product links:
                                                                                                                  ULTRA-LUXURY: chanel.com, hermes.com, goyard.com, moynat.com
                                                                                                                  INVESTMENT/EXOTIC: nancygonzalez.com, judithleiberny.com
                                                                                                                  PREMIER LUXURY: louisvuitton.com, dior.com, bottegaveneta.com, tomford.com, therow.com, valextra.com, ratioetmotus.com, metier.com, zanellato.com, asprey.com, connollyengland.com, launer.com, borbonese.com, cortomoltedo.com
                                                                                                                  HIGH LUXURY: loewe.com, celine.com, ysl.com (Saint Laurent), givenchy.com, prada.com, gucci.com, burberry.com, valentino.com, balenciaga.com, miumiu.com, fendi.com, marni.com, gabrielahearst.com
                                                                                                                  ACCESSIBLE LUXURY: strathberry.com, coach.com, mulberry.com, toryburch.com, katespade.com, furla.com
                                                                                                                  CONTEMPORARY DESIGNER: wandler.com, yuzefi.com, khaite.com, jacquemus.com, proenzaschouler.com, huntingseason.com, anyahindmarch.com, margesherwood.com, jwanderson.com, stfrockstaud.com (Staud), rejinapyo.com, medea-online.com, studioamelia.com
                                                                                                                  AFFORDABLE LUXURY: polene-paris.com, demellier.com, strathberry.com, senreve.com, cuyana.com, mansurgavriel.com, byfar.com, cafune.com, mlouye.com, songmont.com
                                                                                                                  ACCESSIBLE: sezane.com, apc.fr (A.P.C.), ganni.com, vasic.nyc, loefflershoes.com (Loeffler Randall), nanushka.com, osfrstore.com (Osoi)
                                                                                                                  
                                                                                                                  MULTI-BRAND RETAILERS: net-a-porter.com, farfetch.com, ssense.com, luisaviaroma.com, matchesfashion.com
                                                                                                                  
                                                                                                                  For each product suggestion, provide a search URL. For brand websites, use format: https://www.brandsite.com/search?q=product+name (or the brand's known search URL pattern). For multi-brand retailers use their search patterns.
                                                                                                                  
                                                                                                                  Return ONLY a valid JSON array, no other text:
                                                                                                                  [
                                                                                                                    {
                                                                                                                        "name": "Product Name",
                                                                                                                            "brand": "Brand Name",
                                                                                                                                "price": "$XXX - $XXX",
                                                                                                                                    "retailer": "Brand Name or Retailer Name",
                                                                                                                                        "retailerUrl": "search URL on brand site or retailer",
                                                                                                                                            "retailerType": "brand" or "retailer"
                                                                                                                                              }
                                                                                                                                              ]
                                                                                                                                              
                                                                                                                                              Include a mix: 2-3 products linking to the brand's own website, and 2-3 from multi-brand retailers (Net-a-Porter, Farfetch, SSENSE, Luisaviaroma, Matches Fashion). Make sure URLs are properly formatted.`
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
