// ===========================================================================
// Maison - the main screen.
//
// What changed when this became a product other people can use:
//   * The "paste your Anthropic API key" box is gone. Nobody types a
//     secret into this page any more, and nothing secret is stored in the
//     browser. The key lives on the server.
//   * Bags are read from and written to Supabase instead of localStorage,
//     so they follow you between devices and stay private to your account.
//   * Product suggestions are fetched when you ask for them rather than
//     automatically, because each search uses part of your daily allowance.
// ===========================================================================

import React, { useCallback, useEffect, useState } from 'react';
import {
  Camera,
  Upload,
  Trash2,
  Sparkles,
  TrendingUp,
  AlertCircle,
  Check,
  Search,
  ShoppingBag,
  Clock,
} from 'lucide-react';

import {
  analyzeCollection,
  estimateBagValue,
  searchProducts,
  DailyLimitError,
} from './lib/maisonApi';

import {
  addBagFromFile,
  clearLegacyData,
  deleteBag,
  importLegacyBags,
  listBags,
  readLegacyBags,
  updateBagFields,
} from './lib/bagStore';

const RETAILER_COLORS = {
  'net-a-porter': { bg: 'bg-black', text: 'text-white', label: 'NET-A-PORTER' },
  farfetch: { bg: 'bg-gray-900', text: 'text-white', label: 'FARFETCH' },
  ssense: { bg: 'bg-black', text: 'text-white', label: 'SSENSE' },
  luisaviaroma: { bg: 'bg-orange-600', text: 'text-white', label: 'LUISAVIAROMA' },
  matchesfashion: { bg: 'bg-emerald-800', text: 'text-white', label: 'MATCHESFASHION' },
};

const getRetailerStyle = (retailer) => {
  const key = String(retailer || '').toLowerCase().replace(/\s+/g, '');
  const entries = Object.entries(RETAILER_COLORS);
  for (let i = 0; i < entries.length; i += 1) {
    if (key.includes(entries[i][0].replace(/[-\s]/g, ''))) return entries[i][1];
  }
  return { bg: 'bg-gray-800', text: 'text-white', label: retailer || 'Shop' };
};

const money = (value) =>
  value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const BagWardrobeAnalyzer = () => {
  const [bags, setBags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [usage, setUsage] = useState(null);
  const [recProducts, setRecProducts] = useState({});
  const [loadingProducts, setLoadingProducts] = useState({});
  const [legacyCount, setLegacyCount] = useState(0);
  const [importState, setImportState] = useState({ running: false, done: 0, total: 0 });

  // --- Load this account's own bags -------------------------------------
  const reload = useCallback(async () => {
    try {
      const loaded = await listBags();
      setBags(loaded);
    } catch (error) {
      setNotice({ kind: 'error', text: 'We could not load your collection. ' + error.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    setLegacyCount(readLegacyBags().length);
  }, [reload]);

  const reportError = (error) => {
    if (error instanceof DailyLimitError) {
      setNotice({ kind: 'limit', text: error.message });
      if (error.dailyLimit) setUsage({ used: error.used, dailyLimit: error.dailyLimit });
      return;
    }
    setNotice({ kind: 'error', text: error.message });
  };

  const rememberUsage = (data) => {
    if (data && typeof data.dailyLimit === 'number') {
      setUsage({ used: data.used, dailyLimit: data.dailyLimit });
    }
  };

  // --- One-time import of a collection left in this browser -------------
  const runImport = async () => {
    setImportState({ running: true, done: 0, total: legacyCount });
    try {
      const result = await importLegacyBags((done, total) => {
        setImportState({ running: true, done: done, total: total });
      });
      await reload();
      setLegacyCount(readLegacyBags().length);
      setNotice({
        kind: result.failed > 0 ? 'error' : 'success',
        text:
          result.failed > 0
            ? 'Imported ' + result.imported + ' bags, but ' + result.failed +
              ' could not be copied. The old copy in this browser has been ' +
              'left alone so you can try again.'
            : 'Imported ' + result.imported + ' bags into your account. The ' +
              'old copy in this browser, including the saved API key, has ' +
              'been cleared.',
      });
    } catch (error) {
      reportError(error);
    } finally {
      setImportState({ running: false, done: 0, total: 0 });
    }
  };

  const skipImport = () => {
    clearLegacyData();
    setLegacyCount(0);
  };

  // --- Adding, editing and removing bags --------------------------------
  const handleImageUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;

    setUploading(true);
    setNotice(null);

    for (let i = 0; i < files.length; i += 1) {
      try {
        const bag = await addBagFromFile(files[i]);
        setBags((previous) => previous.concat([bag]));
      } catch (error) {
        reportError(error);
      }
    }

    setUploading(false);
  };

  const removeBag = async (bag) => {
    setBags((previous) => previous.filter((item) => item.id !== bag.id));
    setAnalysis(null);
    try {
      await deleteBag(bag.id, bag.photoPath);
    } catch (error) {
      reportError(error);
      reload();
    }
  };

  const updateBagDetails = (id, field, value) => {
    setBags((previous) =>
      previous.map((bag) =>
        bag.id === id ? Object.assign({}, bag, { [field]: value }) : bag
      )
    );
  };

  // Saved when you click away from a box, so we are not writing to the
  // database on every keystroke.
  const saveBagField = async (bag, field) => {
    try {
      await updateBagFields(bag.id, { [field]: bag[field] });
    } catch (error) {
      reportError(error);
    }
  };

  // --- Talking to Claude, through our own server ------------------------
  const runAnalysis = async () => {
    if (bags.length === 0) {
      setNotice({ kind: 'error', text: 'Please add at least one bag photo first.' });
      return;
    }

    setIsAnalyzing(true);
    setNotice(null);
    setRecProducts({});
    setLoadingProducts({});

    try {
      const data = await analyzeCollection(bags.map((bag) => bag.id));
      rememberUsage(data);
      setAnalysis(
        data.result || {
          overview: data.text || '',
          gaps: [],
          outdated: [],
          recommendations: [],
        }
      );
    } catch (error) {
      reportError(error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const runValuation = async (bag) => {
    if (!bag.brand || !bag.model) {
      setNotice({ kind: 'error', text: 'Please fill in the brand and model first.' });
      return;
    }

    setNotice(null);
    updateBagDetails(bag.id, 'estimating', true);

    try {
      const data = await estimateBagValue(bag.id);
      rememberUsage(data);

      const valuation = data.result;
      if (!valuation) {
        throw new Error('Claude did not return a valuation. Please try again.');
      }

      const patch = {
        estimatedValue:
          valuation.estimatedValue === undefined
            ? ''
            : String(valuation.estimatedValue),
        valuationReasoning: valuation.reasoning || '',
        marketTrend: valuation.marketTrend || '',
        confidence: valuation.confidence || '',
      };

      await updateBagFields(bag.id, patch);
      setBags((previous) =>
        previous.map((item) =>
          item.id === bag.id
            ? Object.assign({}, item, patch, { estimating: false })
            : item
        )
      );
    } catch (error) {
      updateBagDetails(bag.id, 'estimating', false);
      reportError(error);
    }
  };

  const findProducts = async (index, query) => {
    setLoadingProducts((previous) =>
      Object.assign({}, previous, { [index]: true })
    );
    try {
      const data = await searchProducts(query);
      rememberUsage(data);
      setRecProducts((previous) =>
        Object.assign({}, previous, { [index]: (data && data.products) || [] })
      );
    } catch (error) {
      reportError(error);
    } finally {
      setLoadingProducts((previous) =>
        Object.assign({}, previous, { [index]: false })
      );
    }
  };

  const collectionValue = () => {
    const totalPurchasePrice = bags.reduce(
      (sum, bag) => sum + (parseFloat(bag.purchasePrice) || 0),
      0
    );
    const totalEstimatedValue = bags.reduce(
      (sum, bag) => sum + (parseFloat(bag.estimatedValue) || 0),
      0
    );
    const bagsWithValues = bags.filter(
      (bag) => bag.purchasePrice && bag.estimatedValue
    ).length;
    const appreciation = totalEstimatedValue - totalPurchasePrice;
    const appreciationPercent =
      totalPurchasePrice > 0
        ? ((appreciation / totalPurchasePrice) * 100).toFixed(1)
        : 0;
    return {
      totalPurchasePrice,
      totalEstimatedValue,
      appreciation,
      appreciationPercent,
      bagsWithValues,
      totalBags: bags.length,
    };
  };

  const totals = collectionValue();

  // -----------------------------------------------------------------------
  // One recommendation, plus an optional 'find these to buy' lookup.
  // -----------------------------------------------------------------------
  const RecommendationCard = ({ rec, index }) => {
    const products = recProducts[index] || [];
    const isLoading = loadingProducts[index];
    const query = rec.searchQuery || rec.type || '';

    return (
      <div className='bg-white rounded-xl shadow-md border-l-4 border-green-500 overflow-hidden'>
        <div className='p-6 pb-3'>
          <div className='flex items-start justify-between mb-2'>
            <h3 className='text-xl font-semibold text-gray-900'>{rec.type}</h3>
            <span
              className={
                'px-3 py-1 rounded-full text-sm font-medium ' +
                (rec.priority === 'high'
                  ? 'bg-red-100 text-red-700'
                  : rec.priority === 'medium'
                  ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-blue-100 text-blue-700')
              }
            >
              {rec.priority} priority
            </span>
          </div>

          <p className='text-gray-600 mb-3'>{rec.reason}</p>

          {rec.suggestedBrands && rec.suggestedBrands.length > 0 ? (
            <div className='flex flex-wrap gap-2 mb-3'>
              {rec.suggestedBrands.map((brand, brandIndex) => (
                <span
                  key={brandIndex}
                  className='bg-gray-100 text-gray-700 px-2.5 py-0.5 rounded-full text-xs font-medium'
                >
                  {brand}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className='px-6 pb-4'>
          {isLoading ? (
            <div className='bg-gray-50 rounded-lg p-4 flex items-center justify-center'>
              <div className='text-center'>
                <div className='animate-spin rounded-full h-6 w-6 border-b-2 border-green-500 mx-auto mb-2' />
                <p className='text-sm text-gray-500'>Looking for products...</p>
              </div>
            </div>
          ) : products.length > 0 ? (
            <div className='space-y-2'>
              <p className='text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2'>
                Shop at retailers
              </p>
              {products.map((product, productIndex) => {
                const style = getRetailerStyle(product.retailer);
                return (
                  <a
                    key={productIndex}
                    href={product.retailerUrl}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all'
                  >
                    <div className='flex-1 min-w-0 mr-3'>
                      <p className='text-sm font-medium text-gray-900 truncate'>
                        {product.brand} - {product.name}
                      </p>
                      <p className='text-xs text-gray-500'>{product.price}</p>
                    </div>
                    <span
                      className={
                        style.bg +
                        ' ' +
                        style.text +
                        ' px-3 py-1.5 rounded text-xs font-bold whitespace-nowrap'
                      }
                    >
                      {style.label}
                    </span>
                  </a>
                );
              })}
            </div>
          ) : (
            <button
              type='button'
              onClick={() => findProducts(index, query)}
              className='w-full inline-flex items-center justify-center gap-2 bg-gray-900 text-white py-2 rounded-lg text-sm font-medium hover:bg-gray-700'
            >
              <ShoppingBag className='w-4 h-4' />
              Find these to buy
            </button>
          )}
        </div>

        <div className='px-6 pb-4'>
          <div className='flex flex-wrap gap-2 pt-3 border-t border-gray-100'>
            <a
              href={'https://www.net-a-porter.com/en-us/shop/search/' + encodeURIComponent(query)}
              target='_blank'
              rel='noopener noreferrer'
              className='inline-flex items-center gap-1 px-2.5 py-1 bg-black text-white rounded text-xs font-medium'
            >
              NET-A-PORTER
            </a>
            <a
              href={'https://www.farfetch.com/shopping/women/search/items.aspx?q=' + encodeURIComponent(query)}
              target='_blank'
              rel='noopener noreferrer'
              className='inline-flex items-center gap-1 px-2.5 py-1 bg-gray-900 text-white rounded text-xs font-medium'
            >
              FARFETCH
            </a>
            <a
              href={'https://www.ssense.com/en-us/women/search?q=' + encodeURIComponent(query)}
              target='_blank'
              rel='noopener noreferrer'
              className='inline-flex items-center gap-1 px-2.5 py-1 bg-black text-white rounded text-xs font-medium'
            >
              SSENSE
            </a>
            <a
              href={'https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(query)}
              target='_blank'
              rel='noopener noreferrer'
              className='inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 rounded text-xs font-medium'
            >
              <Search className='w-3 h-3' /> Images
            </a>
          </div>
        </div>
      </div>
    );
  };

  // -----------------------------------------------------------------------
  // The page
  // -----------------------------------------------------------------------
  return (
    <div className='min-h-screen bg-gradient-to-br from-rose-50 via-white to-amber-50 p-8'>
      <div className='max-w-6xl mx-auto'>
        <div className='text-center mb-10'>
          <div className='flex items-center justify-center gap-3 mb-4'>
            <Camera className='w-10 h-10 text-rose-600' />
            <h1 className='text-4xl font-bold text-gray-900'>Maison</h1>
          </div>
          <p className='text-gray-600 text-lg'>
            Your handbag wardrobe, analysed.
          </p>
        </div>

        {/* How much of today's allowance is left */}
        {usage ? (
          <div className='bg-white/70 border border-gray-100 rounded-lg px-4 py-2 mb-6 flex items-center gap-2 text-sm text-gray-600'>
            <Clock className='w-4 h-4 text-gray-400' />
            {usage.used} of {usage.dailyLimit} AI requests used today
          </div>
        ) : null}

        {/* Anything we need to tell the person */}
        {notice ? (
          <div
            className={
              'rounded-lg p-4 mb-6 flex items-start gap-3 border ' +
              (notice.kind === 'success'
                ? 'bg-green-50 border-green-200 text-green-800'
                : notice.kind === 'limit'
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-red-50 border-red-200 text-red-800')
            }
          >
            {notice.kind === 'success' ? (
              <Check className='w-5 h-5 mt-0.5' />
            ) : (
              <AlertCircle className='w-5 h-5 mt-0.5' />
            )}
            <p className='text-sm'>{notice.text}</p>
          </div>
        ) : null}

        {/* Offer to move an old browser-only collection into the account */}
        {legacyCount > 0 ? (
          <div className='bg-indigo-50 border border-indigo-200 rounded-2xl p-6 mb-8'>
            <h2 className='text-lg font-semibold text-indigo-900 mb-1'>
              We found {legacyCount} bags saved in this browser
            </h2>
            <p className='text-sm text-indigo-800 mb-4'>
              These were stored on this device by the older version of the app.
              Import them into your account and they will be private to you,
              backed up, and available on any device. The old copy in this
              browser is cleared afterwards.
            </p>

            {importState.running ? (
              <p className='text-sm text-indigo-800'>
                Importing {importState.done} of {importState.total}...
              </p>
            ) : (
              <div className='flex flex-wrap gap-3'>
                <button
                  type='button'
                  onClick={runImport}
                  className='px-5 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700'
                >
                  Import my {legacyCount} bags
                </button>
                <button
                  type='button'
                  onClick={skipImport}
                  className='px-5 py-2.5 text-indigo-700 underline text-sm'
                >
                  No thanks, discard the old copy
                </button>
              </div>
            )}
          </div>
        ) : null}

        {/* Upload box */}
        <div className='bg-white rounded-2xl shadow-lg p-8 mb-8'>
          <label className='flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-rose-300 rounded-xl cursor-pointer hover:border-rose-500 hover:bg-rose-50 transition-all'>
            <div className='flex flex-col items-center justify-center pt-5 pb-6'>
              <Upload className='w-12 h-12 text-rose-500 mb-3' />
              <p className='mb-2 text-lg font-semibold text-gray-700'>
                {uploading ? 'Uploading...' : 'Click to upload bag photos'}
              </p>
              <p className='text-sm text-gray-500'>PNG, JPG, WEBP or GIF</p>
            </div>
            <input
              type='file'
              className='hidden'
              accept='image/png,image/jpeg,image/webp,image/gif'
              multiple
              disabled={uploading}
              onChange={handleImageUpload}
            />
          </label>
        </div>

        {loading ? (
          <div className='text-center py-16 text-gray-500'>
            Loading your collection...
          </div>
        ) : null}

        {!loading && bags.length > 0 ? (
          <div className='bg-white rounded-2xl shadow-lg p-8 mb-8'>
            <h2 className='text-2xl font-bold text-gray-900 mb-6'>
              Your collection ({bags.length} {bags.length === 1 ? 'bag' : 'bags'})
            </h2>

            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6'>
              {bags.map((bag) => (
                <div key={bag.id} className='relative group bg-gray-50 rounded-xl p-4 shadow-md'>
                  <div className='aspect-square rounded-lg overflow-hidden bg-gray-100 shadow-md mb-4'>
                    {bag.image ? (
                      <img
                        src={bag.image}
                        alt={bag.name || 'Bag'}
                        className='w-full h-full object-cover'
                      />
                    ) : (
                      <div className='w-full h-full flex items-center justify-center text-gray-300'>
                        <Camera className='w-10 h-10' />
                      </div>
                    )}
                  </div>

                  <button
                    type='button'
                    onClick={() => removeBag(bag)}
                    aria-label='Remove this bag'
                    className='absolute top-6 right-6 bg-red-500 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-red-600'
                  >
                    <Trash2 className='w-4 h-4' />
                  </button>

                  <div className='space-y-3'>
                    <input
                      type='text'
                      placeholder='Brand (e.g. Gucci)'
                      value={bag.brand}
                      onChange={(event) => updateBagDetails(bag.id, 'brand', event.target.value)}
                      onBlur={() => saveBagField(bag, 'brand')}
                      className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-rose-500'
                    />
                    <input
                      type='text'
                      placeholder='Model (e.g. Marmont)'
                      value={bag.model}
                      onChange={(event) => updateBagDetails(bag.id, 'model', event.target.value)}
                      onBlur={() => saveBagField(bag, 'model')}
                      className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-rose-500'
                    />
                    <input
                      type='number'
                      placeholder='Purchase price'
                      value={bag.purchasePrice}
                      onChange={(event) => updateBagDetails(bag.id, 'purchasePrice', event.target.value)}
                      onBlur={() => saveBagField(bag, 'purchasePrice')}
                      className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-rose-500'
                    />
                    <input
                      type='date'
                      value={bag.purchaseDate}
                      onChange={(event) => updateBagDetails(bag.id, 'purchaseDate', event.target.value)}
                      onBlur={() => saveBagField(bag, 'purchaseDate')}
                      className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-rose-500'
                    />
                    <input
                      type='number'
                      placeholder='Estimated current value'
                      value={bag.estimatedValue}
                      onChange={(event) => updateBagDetails(bag.id, 'estimatedValue', event.target.value)}
                      onBlur={() => saveBagField(bag, 'estimatedValue')}
                      className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-rose-500'
                    />
                    <select
                      value={bag.condition}
                      onChange={(event) => {
                        updateBagDetails(bag.id, 'condition', event.target.value);
                        updateBagFields(bag.id, { condition: event.target.value }).catch(reportError);
                      }}
                      className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-rose-500'
                    >
                      <option value='excellent'>Excellent</option>
                      <option value='good'>Good</option>
                      <option value='fair'>Fair</option>
                      <option value='poor'>Poor</option>
                    </select>

                    <button
                      type='button'
                      onClick={() => runValuation(bag)}
                      disabled={!bag.brand || !bag.model || bag.estimating}
                      className='w-full bg-gradient-to-r from-purple-500 to-indigo-500 text-white py-2 px-4 rounded-lg font-medium hover:from-purple-600 hover:to-indigo-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2'
                    >
                      {bag.estimating ? (
                        <React.Fragment>
                          <div className='animate-spin rounded-full h-4 w-4 border-b-2 border-white' />
                          Estimating...
                        </React.Fragment>
                      ) : (
                        <React.Fragment>
                          <Sparkles className='w-4 h-4' />
                          AI estimate value
                        </React.Fragment>
                      )}
                    </button>

                    {bag.valuationReasoning ? (
                      <div className='bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-sm'>
                        <p className='font-semibold text-indigo-900 mb-1'>AI valuation</p>
                        <p className='text-indigo-700 mb-2'>{bag.valuationReasoning}</p>
                        <div className='flex gap-2 text-xs'>
                          <span
                            className={
                              'px-2 py-1 rounded ' +
                              (bag.marketTrend === 'appreciating'
                                ? 'bg-green-100 text-green-700'
                                : bag.marketTrend === 'depreciating'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-gray-100 text-gray-700')
                            }
                          >
                            {bag.marketTrend}
                          </span>
                          <span className='px-2 py-1 rounded bg-indigo-100 text-indigo-700'>
                            {bag.confidence} confidence
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            <div className='bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl shadow-lg p-6 mb-6'>
              <h3 className='text-xl font-bold text-gray-900 mb-4 flex items-center gap-2'>
                <TrendingUp className='w-6 h-6 text-emerald-600' />
                Collection value tracker
              </h3>
              <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
                <div className='bg-white rounded-xl p-4 shadow'>
                  <p className='text-sm text-gray-600 mb-1'>Total purchase price</p>
                  <p className='text-2xl font-bold text-gray-900'>
                    ${money(totals.totalPurchasePrice)}
                  </p>
                </div>
                <div className='bg-white rounded-xl p-4 shadow'>
                  <p className='text-sm text-gray-600 mb-1'>Estimated value</p>
                  <p className='text-2xl font-bold text-gray-900'>
                    ${money(totals.totalEstimatedValue)}
                  </p>
                </div>
                <div className='bg-white rounded-xl p-4 shadow'>
                  <p className='text-sm text-gray-600 mb-1'>Appreciation</p>
                  <p
                    className={
                      'text-2xl font-bold ' +
                      (totals.appreciation >= 0 ? 'text-green-600' : 'text-red-600')
                    }
                  >
                    {totals.appreciation >= 0 ? '+' : ''}${money(totals.appreciation)}
                  </p>
                  <p className='text-sm text-gray-500'>
                    ({totals.appreciationPercent}%)
                  </p>
                </div>
                <div className='bg-white rounded-xl p-4 shadow'>
                  <p className='text-sm text-gray-600 mb-1'>Tracked bags</p>
                  <p className='text-2xl font-bold text-gray-900'>
                    {totals.bagsWithValues} / {totals.totalBags}
                  </p>
                  <p className='text-sm text-gray-500'>with values entered</p>
                </div>
              </div>
            </div>

            <button
              type='button'
              onClick={runAnalysis}
              disabled={isAnalyzing}
              className='w-full bg-gradient-to-r from-rose-500 to-amber-500 text-white py-4 rounded-xl font-semibold text-lg hover:from-rose-600 hover:to-amber-600 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2'
            >
              {isAnalyzing ? (
                <React.Fragment>
                  <div className='animate-spin rounded-full h-5 w-5 border-b-2 border-white' />
                  Analysing your collection...
                </React.Fragment>
              ) : (
                <React.Fragment>
                  <Sparkles className='w-5 h-5' />
                  Analyse my collection
                </React.Fragment>
              )}
            </button>
          </div>
        ) : null}

        {analysis ? (
          <div className='space-y-6'>
            <div className='bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl shadow-lg p-8'>
              <div className='flex items-start gap-3 mb-4'>
                <Sparkles className='w-6 h-6 text-purple-600 mt-1' />
                <h2 className='text-2xl font-bold text-gray-900'>Collection overview</h2>
              </div>
              <p className='text-gray-700 text-lg leading-relaxed'>{analysis.overview}</p>
            </div>

            {analysis.gaps && analysis.gaps.length > 0 ? (
              <div className='bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl shadow-lg p-8'>
                <div className='flex items-start gap-3 mb-4'>
                  <AlertCircle className='w-6 h-6 text-amber-600 mt-1' />
                  <h2 className='text-2xl font-bold text-gray-900'>Identified gaps</h2>
                </div>
                <ul className='space-y-3'>
                  {analysis.gaps.map((gap, index) => (
                    <li key={index} className='flex items-start gap-3 text-gray-700'>
                      <span className='text-amber-500 font-bold mt-1'>&rarr;</span>
                      <span className='text-lg'>{gap}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {analysis.outdated && analysis.outdated.length > 0 ? (
              <div className='bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl shadow-lg p-8'>
                <div className='flex items-start gap-3 mb-4'>
                  <TrendingUp className='w-6 h-6 text-blue-600 mt-1' />
                  <h2 className='text-2xl font-bold text-gray-900'>Items to consider</h2>
                </div>
                <ul className='space-y-3'>
                  {analysis.outdated.map((item, index) => (
                    <li key={index} className='flex items-start gap-3 text-gray-700'>
                      <span className='text-blue-500 font-bold mt-1'>&bull;</span>
                      <span className='text-lg'>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {analysis.recommendations && analysis.recommendations.length > 0 ? (
              <div className='bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl shadow-lg p-8'>
                <div className='flex items-start gap-3 mb-6'>
                  <Check className='w-6 h-6 text-green-600 mt-1' />
                  <h2 className='text-2xl font-bold text-gray-900'>Recommended additions</h2>
                </div>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                  {analysis.recommendations.map((rec, index) => (
                    <RecommendationCard key={index} rec={rec} index={index} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {!loading && bags.length === 0 && !analysis ? (
          <div className='text-center py-16 text-gray-500'>
            <Camera className='w-20 h-20 mx-auto mb-4 text-gray-300' />
            <p className='text-xl'>Upload photos of your bags to get started.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default BagWardrobeAnalyzer;
