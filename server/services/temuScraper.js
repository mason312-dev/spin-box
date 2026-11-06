import crypto from 'node:crypto';
import { ApifyClient } from 'apify-client';
import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { scrapeWithStealth } from './stealthScraper.js';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

const FX_RATES_TO_USD = {
  USD: 1.0,
  NGN: 1 / 1550,
  GBP: 1.30,
  EUR: 1.08,
  CAD: 0.74,
  AUD: 0.67
};

export async function canonicalizeTemuUrl(rawInput) {
  let input = String(rawInput || '').trim();
  if (!input) {
    throw new Error('Please provide a valid Temu link or item code.');
  }

  // 1. Raw numeric Goods ID
  const isPureNumber = /^\d{10,25}$/.test(input);
  if (isPureNumber) {
    const cleanUrl = `https://www.temu.com/-g-${input}.html`;
    const urlHash = crypto.createHash('sha256').update(`temu_goods_${input}`).digest('hex');
    return {
      targetUrl: cleanUrl,
      rawUrl: cleanUrl,
      goodsId: input,
      urlHash,
      isNigerian: false
    };
  }

  if (!input.startsWith('http://') && !input.startsWith('https://')) {
    input = `https://${input}`;
  }

  // 2. Unwind short share redirect (share.temu.com)
  if (input.includes('share.temu.com')) {
    try {
      const res = await fetch(input, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(6000)
      });
      if (res.url && res.url !== input) {
        input = res.url;
      }
    } catch {
      // Continue with current input if redirect lookup times out
    }
  }

  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error('Invalid URL format. Please paste a valid Temu product link.');
  }

  if (!parsed.hostname.includes('temu.com')) {
    throw new Error('URL must be a valid temu.com product link.');
  }

  // 3. Detect Nigerian origin
  const isNigerian =
    input.includes('/ng/') ||
    input.includes('locale_override=147') ||
    input.includes('currency=NGN');

  // 4. Extract goods_id
  let goodsId = parsed.searchParams.get('goods_id');
  if (!goodsId) {
    const slugMatch = parsed.pathname.match(/g[_-](\d+)\.html/i);
    if (slugMatch) goodsId = slugMatch[1];
  }

  const cleanUrl = goodsId ? `https://www.temu.com/-g-${goodsId}.html` : input;
  const cacheKey = goodsId ? `temu_goods_${goodsId}` : parsed.pathname;
  const urlHash = crypto.createHash('sha256').update(cacheKey).digest('hex');

  return {
    targetUrl: cleanUrl,
    rawUrl: input, // untouched full raw URL with /ng/ and deal tokens
    goodsId,
    urlHash,
    isNigerian
  };
}

export function evaluateDepositTier(priceUsd, userDepositBalance = 0, currency = 'USD') {
  const balance = Number(userDepositBalance) || 0;
  let multiplier = 2;

  if (balance >= 101) {
    multiplier = 7;
  } else if (balance >= 5) {
    multiplier = 5;
  }

  const maxAllowedPrice = Math.max(Number((balance * multiplier).toFixed(2)), 2.0);
  const isEligibleToSpin = priceUsd <= maxAllowedPrice;

  let requiredDepositNeededUsd = 0;
  if (!isEligibleToSpin) {
    if (priceUsd <= 500) {
      const totalNeeded = Math.max(Math.ceil(priceUsd / 5), 5);
      requiredDepositNeededUsd = Math.max(totalNeeded - balance, 2);
    } else {
      const totalNeeded = Math.max(Math.ceil(priceUsd / 7), 101);
      requiredDepositNeededUsd = Math.max(totalNeeded - balance, 2);
    }
  }

  // Localized clean deposit text
  let depositText = `$${requiredDepositNeededUsd} USD`;
  if (currency === 'NGN') {
    // Round to nearest 500 NGN for clean checkout
    const rawNgn = requiredDepositNeededUsd * 1550;
    const cleanNgn = Math.ceil(rawNgn / 500) * 500;
    depositText = `₦${cleanNgn.toLocaleString('en-NG')}`;
  }

  return {
    multiplier,
    maxAllowedPrice,
    isEligibleToSpin,
    requiredDepositNeeded: requiredDepositNeededUsd,
    depositText
  };
}

async function scrapeViaApify({ targetUrl, goodsId }) {
  const token = process.env.APIFY_API_TOKEN;
  if (!token || token.startsWith('your-') || token === '<YOUR_API_TOKEN>') {
    return null;
  }

  const cleanProductUrl = goodsId ? `https://www.temu.com/-g-${goodsId}.html` : targetUrl;
  console.log(`[Apify] Dispatching run for: "${cleanProductUrl}"`);

  const client = new ApifyClient({ token });

  try {
    const run = await client.actor('2CKn7F7pA4eH2mVRm').call(
      {
        startUrls: [{ url: cleanProductUrl }],
        maxItems: 1,
        getProductDetails: false,
        extractReviews: false
      },
      { timeout: 35 }
    );

    const { items } = await client.dataset(run.defaultDatasetId).listItems({ limit: 1 });
    const item = items?.[0];

    if (!item || item.price === undefined || item.price === null) {
      return null;
    }

    const numericAmount = parseFloat(String(item.price).replace(/,/g, ''));
    if (isNaN(numericAmount) || numericAmount <= 0) return null;

    const currency = (item.currency || 'USD').toUpperCase();
    const fxRate = FX_RATES_TO_USD[currency] || 1.0;
    const priceUsd = Number((numericAmount * fxRate).toFixed(2));

    return {
      title: String(item.title || 'Temu Verified Item').slice(0, 140),
      priceUsd: Math.max(priceUsd, 1.0),
      localPrice: numericAmount,
      localCurrency: currency,
      imageUrl: item.imageUrl || (Array.isArray(item.galleryImages) ? item.galleryImages[0] : ''),
      inStock: true,
      scrapedVia: 'apify-temu-scraper'
    };
  } catch (err) {
    console.warn(`[Apify] Actor call failed: ${err.message}`);
    return null;
  }
}

export async function inspectTemuProduct(rawUrl, userDepositBalance = 0) {
  const normalized = await canonicalizeTemuUrl(rawUrl);
  const { targetUrl, rawUrl: fullRawUrl, urlHash, isNigerian } = normalized;

  // 1. Supabase Cache Check
  const { data: cached } = await supabaseAdmin
    .from('temu_products')
    .select('*')
    .eq('url_hash', urlHash)
    .maybeSingle();

  const now = Date.now();
  if (cached && now - new Date(cached.updated_at).getTime() < CACHE_TTL_MS) {
    const currency = isNigerian ? 'NGN' : 'USD';
    const validation = evaluateDepositTier(Number(cached.price_usd), userDepositBalance, currency);

    const displayPrice =
      currency === 'NGN'
        ? `₦${Math.round(Number(cached.price_usd) * 1550).toLocaleString('en-NG')}`
        : `$${Number(cached.price_usd).toFixed(2)}`;

    return {
      id: cached.id,
      url: cached.product_url,
      title: cached.title,
      priceUsd: Number(cached.price_usd),
      displayPrice,
      currency,
      imageUrl: cached.image_url,
      inStock: cached.in_stock,
      cached: true,
      validation
    };
  }

  let scraped = null;

  // 2. If it's a Nigerian link, prioritize local Stealth Scraper with untouched raw URL
  if (isNigerian) {
    console.log('[TemuScraper] Nigerian link detected. Prioritizing local StealthScraper...');
    try {
      scraped = await scrapeWithStealth(fullRawUrl);
    } catch (err) {
      console.warn(`[StealthScraper] Local extraction failed: ${err.message}. Trying Apify...`);
    }
  }

  // 3. Fallback to Apify (or primary for non-Nigerian links)
  if (!scraped) {
    scraped = await scrapeViaApify(normalized);
  }

  // 4. Last resort stealth retry on clean URL
  if (!scraped && !isNigerian) {
    try {
      scraped = await scrapeWithStealth(targetUrl);
    } catch (err) {
      console.warn(`[StealthScraper] Clean fallback failed: ${err.message}`);
    }
  }

  if (!scraped || !scraped.priceUsd || scraped.priceUsd <= 0) {
    throw new Error(
      'Unable to verify live price for this Temu link right now. Please verify the URL or try another item.'
    );
  }

  // 5. Save to cache
  const { data: savedRow, error } = await supabaseAdmin
    .from('temu_products')
    .upsert(
      {
        url_hash: urlHash,
        product_url: targetUrl,
        title: scraped.title,
        price_usd: scraped.priceUsd,
        image_url: scraped.imageUrl,
        in_stock: scraped.inStock,
        scraped_via: scraped.scrapedVia,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'url_hash' }
    )
    .select()
    .single();

  if (error) throw new Error(error.message);

  const activeCurrency = scraped.localCurrency === 'NGN' || isNigerian ? 'NGN' : 'USD';
  const validation = evaluateDepositTier(
    Number(savedRow.price_usd),
    userDepositBalance,
    activeCurrency
  );

  const displayPrice =
    scraped.localCurrency === 'NGN'
      ? `₦${Math.round(scraped.localPrice).toLocaleString('en-NG')}`
      : activeCurrency === 'NGN'
      ? `₦${Math.round(Number(savedRow.price_usd) * 1550).toLocaleString('en-NG')}`
      : `$${Number(savedRow.price_usd).toFixed(2)}`;

  return {
    id: savedRow.id,
    url: savedRow.product_url,
    title: savedRow.title,
    priceUsd: Number(savedRow.price_usd),
    displayPrice,
    currency: activeCurrency,
    imageUrl: savedRow.image_url,
    inStock: savedRow.in_stock,
    cached: false,
    validation
  };
}