import { Router } from 'express';
import { inspectTemuProduct } from '../services/temuScraper.js';

const router = Router();

router.post('/check-price', async (req, res) => {
  try {
    const { url, userDepositBalance } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'A valid Temu URL is required.'
      });
    }

    const productData = await inspectTemuProduct(url, Number(userDepositBalance) || 0);
    return res.json({
      success: true,
      data: productData
    });
  } catch (err) {
    return res.status(422).json({
      success: false,
      error: err.message || 'Failed to inspect Temu link.'
    });
  }
});

export default router;