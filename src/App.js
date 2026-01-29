import React, { useState } from 'react';
import { Camera, Upload, Trash2, Sparkles, TrendingUp, AlertCircle, Check, Key } from 'lucide-react';

const BagWardrobeAnalyzer = () => {
    const [bags, setBags] = useState([]);
    const [analysis, setAnalysis] = useState(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [apiKey, setApiKey] = useState('');
    const [showApiKeyInput, setShowApiKeyInput] = useState(true);

    const handleImageUpload = (e) => {
          const files = Array.from(e.target.files);
          files.forEach(file => {
                  const reader = new FileReader();
                  reader.onload = (event) => {
                            const newBag = {
                                        id: Date.now() + Math.random(),
                                        image: event.target.result,
                                        name: file.name,
                                        analyzed: false
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

    const analyzeCollection = async () => {
          if (bags.length === 0) {
                  alert('Please upload at least one bag image first!');
                  return;
          }

          if (!apiKey || apiKey.trim() === '') {
                  alert('Please enter your Anthropic API key first!');
                  setShowApiKeyInput(true);
                  return;
          }

          setIsAnalyzing(true);

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
                                                            {
                                                                                type: "text",
                                                                                text: promptText
                                                            },
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
                      throw new Error(errorData.error?.message || 'API Error: ' + response.status);
            }

            const data = await response.json();
                  const analysisText = data.content.find(c => c.type === 'text')?.text || '';

            const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
                  if (jsonMatch) {
                            const parsedAnalysis = JSON.parse(jsonMatch[0]);
                            setAnalysis(parsedAnalysis);
                  } else {
                            setAnalysis({
                                        overview: analysisText,
                                        gaps: [],
                                        outdated: [],
                                        recommendations: []
                            });
                  }
          } catch (error) {
                  console.error('Analysis error:', error);
                  alert('Analysis failed: ' + error.message + '. Please check your API key and try again.');
          } finally {
                  setIsAnalyzing(false);
          }
    };

    return (
          <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-amber-50 p-8">
            <div className="max-w-6xl mx-auto">
              <div className="text-center mb-12">
                <div className="flex items-center justify-center gap-3 mb-4">
                  <Camera className="w-10 h-10 text-rose-600" />
                  <h1 className="text-4xl font-bold text-gray-900">Bag Wardrobe Analyzer</h1>
      </div>
            <p className="text-gray-600 text-lg">
                  Upload photos of your bag collection and get AI-powered recommendations
      </p>
      </div>

  {showApiKeyInput && (
              <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl shadow-lg p-8 mb-8 border-2 border-purple-200">
                <div className="flex items-start gap-3 mb-4">
                  <Key className="w-6 h-6 text-purple-600 mt-1" />
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">API Key Required</h2>
                   <p className="text-gray-600 mb-4">
                      To analyze your bags, you need an Anthropic API key. Get one free at console.anthropic.com
    </p>
                   <div className="flex gap-3">
                      <input
                       type="password"
                       placeholder="Enter your Anthropic API key (sk-ant-...)"
                       value={apiKey}
                       onChange={(e) => setApiKey(e.target.value)}
                       className="flex-1 px-4 py-3 border-2 border-purple-300 rounded-lg focus:outline-none focus:border-purple-500"
                     />
                                           <button
                       onClick={() => {
                                               if (apiKey.trim()) {
                                                                         setShowApiKeyInput(false);
                                               } else {
                                                                         alert('Please enter a valid API key');
                                               }
                       }}
                       className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold"
                     >
                                             Save Key
                         </button>
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
               <button
                 onClick={() => setShowApiKeyInput(true)}
                 className="text-green-600 hover:text-green-800 text-sm underline"
               >
                                 Change Key
                   </button>
                   </div>
           )}

          <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
            <label className="flex flex-col items-center justify-center w-full h-48 border-3 border-dashed border-rose-300 rounded-xl cursor-pointer hover:border-rose-500 hover:bg-rose-50 transition-all">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload className="w-12 h-12 text-rose-500 mb-3" />
                <p className="mb-2 text-lg font-semibold text-gray-700">
                  Click to upload bag photos
  </p>
              <p className="text-sm text-gray-500">PNG, JPG, WEBP (multiple files allowed)</p>
  </div>
            <input
              type="file"
              className="hidden"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
            />
                </label>
                </div>

{bags.length > 0 && (
            <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                Your Collection ({bags.length} {bags.length === 1 ? 'bag' : 'bags'})
  </h2>
             <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mb-6">
{bags.map(bag => (
                  <div key={bag.id} className="relative group">
                    <div className="aspect-square rounded-xl overflow-hidden bg-gray-100 shadow-md">
                      <img
                      src={bag.image}
                      alt={bag.name}
                      className="w-full h-full object-cover"
                    />
                        </div>
                  <button
                    onClick={() => removeBag(bag.id)}
                    className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-red-600"
                  >
                                          <Trash2 className="w-4 h-4" />
                      </button>
                      </div>
              ))}
                </div>

            <button
              onClick={analyzeCollection}
              disabled={isAnalyzing}
              className="w-full bg-gradient-to-r from-rose-500 to-amber-500 text-white py-4 rounded-xl font-semibold text-lg hover:from-rose-600 hover:to-amber-600 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isAnalyzing ? (
                                <>
                                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                                  Analyzing Your Collection...
                </>
              ) : (
                                <>
                                  <Sparkles className="w-5 h-5" />
                                  Analyze My Collection
                </>
              )}
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
                         <span className="text-amber-500 font-bold mt-1">→</span>
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
                        <span className="text-blue-500 font-bold mt-1">•</span>
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
                 <div className="space-y-4">
{analysis.recommendations.map((rec, index) => (
                      <div
                                                    key={index}
                       className="bg-white rounded-xl p-6 shadow-md border-l-4 border-green-500"
                     >
                                               <div className="flex items-start justify-between mb-2">
                                                 <h3 className="text-xl font-semibold text-gray-900">{rec.type}</h3>
                         <span
                           className={
                                                         rec.priority === 'high'
                               ? 'bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm font-medium'
                                                           : rec.priority === 'medium'
                               ? 'bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-sm font-medium'
                                                           : 'bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-medium'
}
                        >
{rec.priority} priority
  </span>
  </div>
                      <p className="text-gray-600 text-lg">{rec.reason}</p>
  </div>
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
