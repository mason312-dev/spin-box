import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

let browserInstance = null;

async function getBrowser() {
  if (browserInstance && browserInstance.connected) {
    return browserInstance;
  }
  browserInstance = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1280,800',
      '--disable-infobars'
    ]
  });
  return browserInstance;
}

export async function scrapeWithStealth(rawTargetUrl) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
    );

    // Block heavy assets to speed up extraction, preserve scripts/documents/xhr
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'media', 'font'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    console.log(`[StealthScraper] Navigating to raw URL: ${rawTargetUrl}`);

    await page.goto(rawTargetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 25000
    });

    // Wait for price container, title, or body hydration
    await page
      .waitForFunction(
        () => {
          const bodyText = document.body ? document.body.innerText : '';
          return (
            bodyText.includes('₦') ||
            bodyText.includes('$') ||
            document.querySelector('[data-type="sale_price"]') ||
            document.querySelector('meta[property="og:title"]')
          );
        },
        { timeout: 10000 }
      )
      .catch(() => {});

    // Evaluate in page context
    const extracted = await page.evaluate((targetUrl) => {
      const pageTitle = document.title || '';

      // 1. Image Extraction: Read high-res top_gallery_url query param first
      let imageUrl = '';
      try {
        const parsed = new URL(targetUrl);
        imageUrl = parsed.searchParams.get('top_gallery_url') || '';
      } catch (_) {}

      // Fallbacks for image
      if (!imageUrl) {
        imageUrl =
          document.querySelector('meta[property="og:image"]')?.content ||
          document.querySelector('meta[name="twitter:image"]')?.content ||
          document.querySelector('img[src*="kwcdn.com"]')?.src ||
          '';
      }

      // Title cleanup
      const metaTitle =
        document.querySelector('meta[property="og:title"]')?.content ||
        pageTitle.replace(/\s*-\s*Temu.*$/i, '').trim();

      // 2. Scan DOM for actual product sale price
      const elements = Array.from(document.querySelectorAll('span, div, strong, b'));
      const ngnCandidates = [];
      const usdCandidates = [];

      for (const el of elements) {
        // Skip large containers
        if (el.children.length > 2) continue;

        const text = (el.innerText || '').trim();

        // STRICT FILTER: Ignore shipping delays, coupons, credit rewards (e.g. ₦1,600 Credit)
        const parentText = (el.parentElement ? el.parentElement.innerText : '').toLowerCase();
        if (
          parentText.includes('credit') ||
          parentText.includes('delay') ||
          parentText.includes('shipping') ||
          parentText.includes('coupon') ||
          parentText.includes('off')
        ) {
          continue;
        }

        // Ignore strikethrough / original prices
        const style = window.getComputedStyle(el);
        const isStrikethrough =
          style.textDecoration.includes('line-through') ||
          el.closest('del, s') !== null ||
          el.className.includes('origin') ||
          el.className.includes('market') ||
          el.className.includes('lineThrough');

        if (isStrikethrough) continue;

        // Match ₦ price pattern
        const ngnMatch = text.match(/^₦\s*([0-9,]+(\.[0-9]{2})?)$/);
        if (ngnMatch && ngnMatch[1]) {
          const val = parseFloat(ngnMatch[1].replace(/,/g, ''));
          // Genuine Temu products are above credit compensation amounts (>= ₦2,000)
          if (!isNaN(val) && val >= 2000) {
            ngnCandidates.push(val);
          }
          continue;
        }

        // Match $ price pattern
        const usdMatch = text.match(/^\$\s*([0-9,]+(\.[0-9]{2})?)$/);
        if (usdMatch && usdMatch[1]) {
          const val = parseFloat(usdMatch[1].replace(/,/g, ''));
          if (!isNaN(val) && val > 0) {
            usdCandidates.push(val);
          }
        }
      }

      let foundPrice = null;
      let foundCurrency = 'USD';

      // Pick lowest genuine candidate (handles discounted/lightning prices over list prices)
      if (ngnCandidates.length > 0) {
        foundPrice = String(Math.min(...ngnCandidates));
        foundCurrency = 'NGN';
      } else if (usdCandidates.length > 0) {
        foundPrice = String(Math.min(...usdCandidates));
        foundCurrency = 'USD';
      }

      return {
        title: metaTitle,
        rawPriceStr: foundPrice,
        currency: foundCurrency,
        imageUrl
      };
    }, rawTargetUrl);

    if (!extracted || !extracted.rawPriceStr) {
      const currentTitle = await page.title();
      throw new Error(`Unable to extract price. Page Title: "${currentTitle}"`);
    }

    const cleanNum = parseFloat(extracted.rawPriceStr.replace(/,/g, ''));
    if (isNaN(cleanNum) || cleanNum <= 0) {
      throw new Error('Parsed price is invalid or zero.');
    }

    // Convert to USD internally for platform tier accounting
    const FX_RATE_NGN = 1 / 1550;
    const priceUsd =
      extracted.currency === 'NGN'
        ? Number((cleanNum * FX_RATE_NGN).toFixed(2))
        : Number(cleanNum.toFixed(2));

    console.log(
      `[StealthScraper] Extracted: "${extracted.title}" | ${extracted.currency} ${cleanNum} (Internal: $${priceUsd} USD)`
    );

    return {
      title: String(extracted.title || 'Temu Verified Item').slice(0, 140),
      priceUsd: Math.max(priceUsd, 1.0),
      localPrice: cleanNum,
      localCurrency: extracted.currency,
      imageUrl: extracted.imageUrl || '',
      inStock: true,
      scrapedVia: 'stealth-puppeteer'
    };
  } finally {
    await page.close();
  }
}