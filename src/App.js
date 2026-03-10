import React, { useState } from 'react';
import { Camera, Upload, Trash2, Sparkles, TrendingUp, AlertCircle, Check, Key, ExternalLink, Search, ShoppingBag } from 'lucide-react';

const RETAILER_COLORS = {
    'net-a-porter': { bg: 'bg-black', text: 'text-white', hover: 'hover:bg-gray-800', label: 'NET-A-PORTER' },
    'farfetch': { bg: 'bg-gray-900', text: 'text-white', hover: 'hover:bg-gray-700', label: 'FARFETCH' },
    'ssense': { bg: 'bg-black', text: 'text-white', hover: 'hover:bg-gray-800', label: 'SSENSE' },
    'luisaviaroma': { bg: 'bg-orange-600', text: 'text-white', hover: 'hover:bg-orange-700', label: 'LUISAVIAROMA' },
    'matchesfashion': { bg: 'bg-emerald-800', text: 'text-white', hover: 'hover:bg-emerald-900', label: 'MATCHESFASHION' },
    'matches fashion': { bg: 'bg-emerald-800', text: 'text-white', hover: 'hover:bg-emerald-900', label: 'MATCHESFASHION' },
};

const getRetailerStyle = (retailer) => {
    const key = retailer.toLowerCase().replace(/\s+/g, '');
    for (const [k, v] of Object.entries(RETAILER_COLORS)) {
          if (key.includes(k.replace(/[-\s]/g, ''))) return v;
    }
    return { bg: 'bg-gray-800', text: 'text-white', hover: 'hover:bg-gray-600', label: retailer };
};

const BagWardrobeAnalyzer = () => {
    const [bags, setBags] = useState(() => {
          const savedBags = localStorage.getItem('bagCollection');
          return savedBags ? JSON.parse(savedBags) : [];
    });
    const [analysis, setAnalysis] = useState(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [apiKey, setApiKey] = useState(() => localStorage.getItem('anthropicApiKey') || '');
    const [showApiKeyInput, setShowApiKeyInput] = useState(() => !localStorage.getItem('anthropicApiKey'));
    const [recProducts, setRecProducts] = useState({});
    const [loadingProducts, setLoadingProducts] = useState({});

    React.useEffect(() => {
          localStorage.setItem('bagCollection', JSON.stringify(bags));
    }, [bags]);

    const handleImageUpload = (e) => {
          const files = Array.from(e.target.files);
          files.forEach(file => {
                  const reader = new FileReader();
                  reader.onload = (event) => {
                            const newBag = {
                                        id: Date.now() + Math.random(),
                                        image: event.target.result,
                                        name: file.name,
                                        analyzed: false,
                                        brand: '', model: '', purchasePrice: '', purchaseDate: '',
                                        estimatedValue: '', condition: 'good', estimating: false,
                                        valuationReasoning: '', marketTrend: '', confidence: '',
                            };
                            setBags(prev => [...prev, newBag]);
                  };
                  reader.readAsDataURL(file);
          });
    };

    const removeBag = (id) => {
          setBags(prev => prev.filter(bag => bag.id !== id));
          setAnalysis(null);
    };

    const updateBagDetails = (id, field, value) => {
          setBags(prev => prev.map(bag => bag.id === id ? { ...bag, [field]: value } : bag));
    };

    const calculateCollectionValue = () => {
          const totalPurchasePrice = bags.reduce((sum, bag) => sum + (parseFloat(bag.purchasePrice) || 0), 0);
          const totalEstimatedValue = bags.reduce((sum, bag) => sum + (parseFloat(bag.estimatedValue) || 0), 0);
          const bagsWithValues = bags.filter(bag => bag.purchasePrice && bag.estimatedValue);
          const appreciation = totalEstimatedValue - totalPurchasePrice;
          const appreciationPercent = totalPurchasePrice > 0 ? ((appreciation / totalPurchasePrice) * 100).toFixed(1) : 0;
          return { totalPurchasePrice, totalEstimatedValue, appreciation, appreciationPercent, bagsWithValues: bagsWithValues.length, totalBags: bags.length };
    };

    const fetchRecommendationProducts = async (recommendations) => {
          const newLoading = {};
          recommendations.forEach((_, i) => { newLoading[i] = true; });
          setLoadingProducts(newLoading);

          for (let i = 0; i < recommendations.length; i++) {
                  const rec = recommendations[i];
                  const query = rec.searchQuery || rec.type;
                  try {
                            const response = await fetch("/api/search-image", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ apiKey, query })
                            });
                            if (response.ok) {
                                        const data = await response.json();
                                        if (data.products && data.products.length > 0) {
                                                      setRecProducts(prev => ({ ...prev, [i]: data.products }));
                                        }
                            }
                  } catch (error) {
                            console.error('Product search error:', error);
                  }
                  setLoadingProducts(prev => ({ ...prev, [i]: false }));
          }
    };

    const analyzeCollection = async () => {
          if (bags.length === 0) { alert('Please upload at least one bag image first!'); return; }
          if (!apiKey || apiKey.trim() === '') { alert('Please enter your Anthropic API key first!'); setShowApiKeyInput(true); return; }
          setIsAnalyzing(true);
          setRecProducts({});
          setLoadingProducts({});
          try {
                  const response = await fetch("/api/analyze", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ apiKey, bags })
                  });
                  if (!response.ok) {
                            const errorData = await response.json();
                            throw new Error(errorData.error?.message || 'API Error: ' + response.status);
                  }
                  const data = await response.json();
                  const analysisText = data.content.find(c => c.type === 'text')?.text || '';
                  const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
                  if (jsonMatch) {
                            const parsedAnalysis = JSON.parse(jsonMatch[0]);
                            setAnalysis(parsedAnalysis);
                            if (parsedAnalysis.recommendations && parsedAnalysis.recommendations.length > 0) {
                                        fetchRecommendationProducts(parsedAnalysis.recommendations);
                            }
                  } else {
                            setAnalysis({ overview: analysisText, gaps: [], outdated: [], recommendations: [] });
                  }
          } catch (error) {
                  console.error('Analysis error:', error);
                  alert('Analysis failed: ' + error.message + '. Please check your API key and try again.');
          } finally {
                  setIsAnalyzing(false);
          }
    };

    const estimateBagValue = async (bagId) => {
          const bag = bags.find(b => b.id === bagId);
          if (!bag.brand || !bag.model) { alert('Please enter brand and model first!'); return; }
          if (!apiKey || apiKey.trim() === '') { alert('Please enter your Anthropic API key first!'); setShowApiKeyInput(true); return; }
          setBags(prev => prev.map(b => b.id === bagId ? { ...b, estimating: true } : b));
          const promptText = `You are a luxury handbag valuation expert. Estimate the current resale market value for this bag:\n\nBrand: ${bag.brand}\nModel: ${bag.model}\nCondition: ${bag.condition}\nPurchase Price: ${bag.purchasePrice ? '$' + bag.purchasePrice : 'Not provided'}\nPurchase Date: ${bag.purchaseDate || 'Not provided'}\n\nProvide your estimate as a JSON object with this structure:\n{\n  "estimatedValue": <number>,\n  "reasoning": "<brief explanation>",\n  "marketTrend": "<appreciating/stable/depreciating>",\n  "confidence": "<high/medium/low>"\n}`;
          try {
                  const response = await fetch("/api/analyze", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ apiKey, bags: [{ id: bag.id, image: bag.image, brand: bag.brand, model: bag.model, condition: bag.condition }], customPrompt: promptText })
                  });
                  if (!response.ok) { const errorData = await response.json(); throw new Error(errorData.error?.message || 'API Error: ' + response.status); }
                  const data = await response.json();
                  const analysisText = data.content.find(c => c.type === 'text')?.text || '';
                  const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
                  if (jsonMatch) {
                            const valuation = JSON.parse(jsonMatch[0]);
                            setBags(prev => prev.map(b => b.id === bagId ? { ...b, estimatedValue: valuation.estimatedValue.toString(), valuationReasoning: valuation.reasoning, marketTrend: valuation.marketTrend, confidence: valuation.confidence, estimating: false } : b));
                            alert(`Estimated Value: $${valuation.estimatedValue}\n\nReasoning: ${valuation.reasoning}\n\nMarket Trend: ${valuation.marketTrend}\nConfidence: ${valuation.confidence}`);
                  }
          } catch (error) {
                  console.error('Valuation error:', error);
                  alert('Valuation failed: ' + error.message);
                  setBags(prev => prev.map(b => b.id === bagId ? { ...b, estimating: false } : b));
          }
    };

    const RecommendationCard = ({ rec, index }) => {
          const products = recProducts[index] || [];
          const isLoading = loadingProducts[index];
          const searchQuery = rec.searchQuery || rec.type;

          return (
                  <div className="bg-white rounded-xl shadow-md border-l-4 border-green-500 overflow-hidden">
                    <div className="p-6 pb-3">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="text-xl font-semibold text-gray-900">{rec.type}</h3>
              <span className={rec.priority === 'high' ? 'bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm font-medium' : rec.priority === 'medium' ? 'bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-sm font-medium' : 'bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-medium'}>
{rec.priority} priority
  </span>
  </div>
          <p className="text-gray-600 mb-3">{rec.reason}</p>
{rec.suggestedBrands && rec.suggestedBrands.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
{rec.suggestedBrands.map((brand, bIdx) => (
                  <span key={bIdx} className="bg-gray-100 text-gray-700 px-2.5 py-0.5 rounded-full text-xs font-medium">{brand}</span>
                                       ))}
</div>
          )}
</div>

{/* Product suggestions from fashion retailers */}
        <div className="px-6 pb-4">
        {isLoading ? (
                      <div className="bg-gray-50 rounded-lg p-4 flex items-center justify-center">
                        <div className="text-center">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-500 mx-auto mb-2"></div>
                          <p className="text-sm text-gray-500">Finding products on fashion retailers...</p>
          </div>
          </div>
                    ) : products.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Shop at retailers</p>
        {products.map((product, pIdx) => {
                          const style = getRetailerStyle(product.retailer);
                          return (
                                              <a key={pIdx} href={product.retailerUrl} target="_blank" rel="noopener noreferrer"
                              className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all group">
                                                    <div className="flex-1 min-w-0 mr-3">
                                                      <p className="text-sm font-medium text-gray-900 truncate">{product.brand} - {product.name}</p>
                                            <p className="text-xs text-gray-500">{product.price}</p>
                      </div>
                                          <span className={`${style.bg} ${style.text} px-3 py-1.5 rounded text-xs font-bold whitespace-nowrap ${style.hover} transition-colors`}>
                      {style.label}
</span>
  </a>
                );
})}
  </div>
          ) : (
                        <div className="bg-gray-50 rounded-lg p-3 text-center">
                          <p className="text-sm text-gray-400">No product suggestions available</p>
            </div>
          )}
</div>

{/* Quick search links */}
        <div className="px-6 pb-4">
                    <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-100">
                      <a href={`https://www.net-a-porter.com/en-us/shop/search/${encodeURIComponent(searchQuery)}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-black text-white rounded text-xs font-medium hover:bg-gray-700 transition-colors">
                              NET-A-PORTER
                </a>
            <a href={`https://www.farfetch.com/shopping/women/search/items.aspx?q=${encodeURIComponent(searchQuery)}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-900 text-white rounded text-xs font-medium hover:bg-gray-700 transition-colors">
                              FARFETCH
                </a>
            <a href={`https://www.ssense.com/en-us/women/search?q=${encodeURIComponent(searchQuery)}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-black text-white rounded text-xs font-medium hover:bg-gray-700 transition-colors">
                              SSENSE
                </a>
            <a href={`https://www.luisaviaroma.com/en-us/search?q=${encodeURIComponent(searchQuery)}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-orange-600 text-white rounded text-xs font-medium hover:bg-orange-700 transition-colors">
                              LVR
                </a>
            <a href={`https://www.matchesfashion.com/us/search?q=${encodeURIComponent(searchQuery)}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-800 text-white rounded text-xs font-medium hover:bg-emerald-900 transition-colors">
                              MATCHES
                </a>
            <a href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(searchQuery)}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 rounded text-xs font-medium hover:bg-blue-100 transition-colors">
                              <Search className="w-3 h-3" /> Images
                </a>
                </div>
                </div>
                </div>
    );
};

  return (
        <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-amber-50 p-8">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <div className="flex items-center justify-center gap-3 mb-4">
                <Camera className="w-10 h-10 text-rose-600" />
                <h1 className="text-4xl font-bold text-gray-900">Bag Wardrobe Analyzer</h1>
    </div>
          <p className="text-gray-600 text-lg">Upload photos of your bag collection and get AI-powered recommendations</p>
    </div>

{showApiKeyInput && (
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl shadow-lg p-8 mb-8 border-2 border-purple-200">
              <div className="flex items-start gap-3 mb-4">
                <Key className="w-6 h-6 text-purple-600 mt-1" />
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">API Key Required</h2>
                 <p className="text-gray-600 mb-4">To analyze your bags, you need an Anthropic API key. Get one free at console.anthropic.com</p>
                 <div className="flex gap-3">
                    <input type="password" placeholder="Enter your Anthropic API key (sk-ant-...)" value={apiKey}
                     onChange={(e) => setApiKey(e.target.value)}
                     className="flex-1 px-4 py-3 border-2 border-purple-300 rounded-lg focus:outline-none focus:border-purple-500" />
                                         <button onClick={() => { if (apiKey.trim()) { localStorage.setItem('anthropicApiKey', apiKey.trim()); setApiKey(apiKey.trim()); setShowApiKeyInput(false); } else { alert('Please enter a valid API key'); } }}
                     className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold">Save Key</button>
                       </div>
                       </div>
                       </div>
                       </div>
         )}

{!showApiKeyInput && (
            <div className="bg-green-50 rounded-lg p-4 mb-8 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-green-600" />
                <span className="text-green-800 font-medium">API Key configured</span>
  </div>
             <button onClick={() => { localStorage.removeItem('anthropicApiKey'); setApiKey(''); setShowApiKeyInput(true); }}
              className="text-green-600 hover:text-green-800 text-sm underline">Change Key</button>
                </div>
        )}

        <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
                    <label className="flex flex-col items-center justify-center w-full h-48 border-3 border-dashed border-rose-300 rounded-xl cursor-pointer hover:border-rose-500 hover:bg-rose-50 transition-all">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <Upload className="w-12 h-12 text-rose-500 mb-3" />
                        <p className="mb-2 text-lg font-semibold text-gray-700">Click to upload bag photos</p>
              <p className="text-sm text-gray-500">PNG, JPG, WEBP (multiple files allowed)</p>
          </div>
            <input type="file" className="hidden" accept="image/*" multiple onChange={handleImageUpload} />
          </label>
          </div>

{bags.length > 0 && (
            <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Your Collection ({bags.length} {bags.length === 1 ? 'bag' : 'bags'})</h2>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
{bags.map(bag => (
                  <div key={bag.id} className="relative group bg-gray-50 rounded-xl p-4 shadow-md">
                    <div className="aspect-square rounded-lg overflow-hidden bg-gray-100 shadow-md mb-4">
                      <img src={bag.image} alt={bag.name} className="w-full h-full object-cover" />
  </div>
                  <button onClick={() => removeBag(bag.id)}
                    className="absolute top-6 right-6 bg-red-500 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-red-600">
                                          <Trash2 className="w-4 h-4" />
                      </button>
                  <div className="space-y-3">
                                          <input type="text" placeholder="Brand (e.g., Gucci)" value={bag.brand}
                      onChange={(e) => updateBagDetails(bag.id, 'brand', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-rose-500" />
                                            <input type="text" placeholder="Model (e.g., Marmont)" value={bag.model}
                      onChange={(e) => updateBagDetails(bag.id, 'model', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-rose-500" />
                                            <input type="number" placeholder="Purchase Price ($)" value={bag.purchasePrice}
                      onChange={(e) => updateBagDetails(bag.id, 'purchasePrice', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-rose-500" />
                                            <input type="date" value={bag.purchaseDate}
                      onChange={(e) => updateBagDetails(bag.id, 'purchaseDate', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-rose-500" />
                                            <input type="number" placeholder="Estimated Current Value ($)" value={bag.estimatedValue}
                      onChange={(e) => updateBagDetails(bag.id, 'estimatedValue', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-rose-500" />
                                            <select value={bag.condition}
                      onChange={(e) => updateBagDetails(bag.id, 'condition', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-rose-500">
                                              <option value="excellent">Excellent</option>
                      <option value="good">Good</option>
                      <option value="fair">Fair</option>
                      <option value="poor">Poor</option>
                        </select>
                    <button onClick={() => estimateBagValue(bag.id)}
                      disabled={!bag.brand || !bag.model || bag.estimating}
                      className="w-full bg-gradient-to-r from-purple-500 to-indigo-500 text-white py-2 px-4 rounded-lg font-medium hover:from-purple-600 hover:to-indigo-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                      {bag.estimating ? (<><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>Estimating...</>) : (<><Sparkles className="w-4 h-4" />AI Estimate Value</>)}
                        </button>
                      {bag.valuationReasoning && (
                                              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-sm">
                                                <p className="font-semibold text-indigo-900 mb-1">AI Valuation</p>
                                               <p className="text-indigo-700 mb-2">{bag.valuationReasoning}</p>
                                               <div className="flex gap-2 text-xs">
                                                  <span className={`px-2 py-1 rounded ${bag.marketTrend === 'appreciating' ? 'bg-green-100 text-green-700' : bag.marketTrend === 'depreciating' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>{bag.marketTrend}</span>
                          <span className="px-2 py-1 rounded bg-indigo-100 text-indigo-700">{bag.confidence} confidence</span>
                        </div>
                        </div>
                    )}
</div>
                      </div>
              ))}
                </div>

{bags.length > 0 && (
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl shadow-lg p-6 mb-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <TrendingUp className="w-6 h-6 text-emerald-600" />Collection Value Tracker
  </h3>
                 <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white rounded-xl p-4 shadow">
                      <p className="text-sm text-gray-600 mb-1">Total Purchase Price</p>
                     <p className="text-2xl font-bold text-gray-900">${calculateCollectionValue().totalPurchasePrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
  </div>
                   <div className="bg-white rounded-xl p-4 shadow">
                      <p className="text-sm text-gray-600 mb-1">Estimated Value</p>
                     <p className="text-2xl font-bold text-gray-900">${calculateCollectionValue().totalEstimatedValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
  </div>
                   <div className="bg-white rounded-xl p-4 shadow">
                      <p className="text-sm text-gray-600 mb-1">Appreciation</p>
                     <p className={`text-2xl font-bold ${calculateCollectionValue().appreciation >= 0 ? 'text-green-600' : 'text-red-600'}`}>
{calculateCollectionValue().appreciation >= 0 ? '+' : ''}${calculateCollectionValue().appreciation.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
</p>
                    <p className={`text-sm ${calculateCollectionValue().appreciation >= 0 ? 'text-green-600' : 'text-red-600'}`}>({calculateCollectionValue().appreciationPercent}%)</p>
  </div>
                  <div className="bg-white rounded-xl p-4 shadow">
                      <p className="text-sm text-gray-600 mb-1">Tracked Bags</p>
                    <p className="text-2xl font-bold text-gray-900">{calculateCollectionValue().bagsWithValues} / {calculateCollectionValue().totalBags}</p>
                      <p className="text-sm text-gray-500">with values entered</p>
  </div>
  </div>
{calculateCollectionValue().bagsWithValues < calculateCollectionValue().totalBags && (
                    <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <p className="text-sm text-amber-800">Add purchase prices and estimated values to all bags for complete tracking</p>
  </div>
                 )}
</div>
            )}

            <button onClick={analyzeCollection} disabled={isAnalyzing}
              className="w-full bg-gradient-to-r from-rose-500 to-amber-500 text-white py-4 rounded-xl font-semibold text-lg hover:from-rose-600 hover:to-amber-600 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {isAnalyzing ? (<><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>Analyzing Your Collection...</>) : (<><Sparkles className="w-5 h-5" />Analyze My Collection</>)}
                </button>
                </div>
                        )}

              {analysis && (
                          <div className="space-y-6">
                            <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl shadow-lg p-8">
                              <div className="flex items-start gap-3 mb-4">
                                <Sparkles className="w-6 h-6 text-purple-600 mt-1" />
                                <h2 className="text-2xl font-bold text-gray-900">Collection Overview</h2>
                </div>
                             <p className="text-gray-700 text-lg leading-relaxed">{analysis.overview}</p>
                </div>

               {analysis.gaps && analysis.gaps.length > 0 && (
                               <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl shadow-lg p-8">
                                 <div className="flex items-start gap-3 mb-4">
                                   <AlertCircle className="w-6 h-6 text-amber-600 mt-1" />
                                   <h2 className="text-2xl font-bold text-gray-900">Identified Gaps</h2>
                 </div>
                                <ul className="space-y-3">
               {analysis.gaps.map((gap, index) => (
                                     <li key={index} className="flex items-start gap-3 text-gray-700">
                                       <span className="text-amber-500 font-bold mt-1">{'\u2192'}</span>
                                                        <span className="text-lg">{gap}</span>
                 </li>
                                                    ))}
               </ul>
                 </div>
                           )}

{analysis.outdated && analysis.outdated.length > 0 && (
                <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl shadow-lg p-8">
                  <div className="flex items-start gap-3 mb-4">
                    <TrendingUp className="w-6 h-6 text-blue-600 mt-1" />
                    <h2 className="text-2xl font-bold text-gray-900">Items to Consider</h2>
  </div>
                 <ul className="space-y-3">
{analysis.outdated.map((item, index) => (
                      <li key={index} className="flex items-start gap-3 text-gray-700">
                        <span className="text-blue-500 font-bold mt-1">{'\u2022'}</span>
                                             <span className="text-lg">{item}</span>
  </li>
                                         ))}
</ul>
  </div>
            )}

{analysis.recommendations && analysis.recommendations.length > 0 && (
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl shadow-lg p-8">
                  <div className="flex items-start gap-3 mb-6">
                    <Check className="w-6 h-6 text-green-600 mt-1" />
                    <h2 className="text-2xl font-bold text-gray-900">Recommended Additions</h2>
  </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
{analysis.recommendations.map((rec, index) => (
                      <RecommendationCard key={index} rec={rec} index={index} />
                    ))}
</div>
  </div>
            )}
</div>
        )}

{bags.length === 0 && !analysis && (
            <div className="text-center py-16 text-gray-500">
              <Camera className="w-20 h-20 mx-auto mb-4 text-gray-300" />
              <p className="text-xl">Upload photos of your bags to get started!</p>
  </div>
         )}
</div>
  </div>
  );
};

export default BagWardrobeAnalyzer;
