import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { getAssetUsdPrice } from './priceOracle.js';

const USDT_TRC20_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const USDC_SOL_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDT_ERC20_CONTRACT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';

// Credit verified blockchain deposit via atomic Supabase RPC
export async function creditBlockchainDeposit({
  userId,
  txHash,
  chain,
  asset,
  amountCrypto
}) {
  const priceUsd = await getAssetUsdPrice(asset);
  const amountUsd = Number((Number(amountCrypto) * priceUsd).toFixed(2));

  if (amountUsd < 2.00) {
    return { credited: false, reason: 'BELOW_MINIMUM_2_USD', amountUsd };
  }

  const { data, error } = await supabaseAdmin.rpc('process_confirmed_deposit', {
    p_user_id: userId,
    p_tx_hash: txHash,
    p_chain: chain.toUpperCase(),
    p_asset: asset.toUpperCase(),
    p_amount_crypto: Number(amountCrypto),
    p_amount_usd: amountUsd
  });

  if (error) {
    console.error('[DepositWatcher] RPC Error:', error.message);
    return { credited: false, error: error.message };
  }

  return data;
}

// 1. Scan TronGrid for TRX & TRC-20 USDT transfers
async function checkTronAddress(addrRow) {
  const { user_id: userId, public_address: address } = addrRow;
  const headers = process.env.TRONGRID_API_KEY
    ? { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY }
    : {};

  try {
    // Check TRC-20 USDT transfers
    const trc20Res = await fetch(
      `https://api.trongrid.io/v1/accounts/${address}/transactions/trc20?limit=10&contract_address=${USDT_TRC20_CONTRACT}`,
      { headers, signal: AbortSignal.timeout(7000) }
    );
    if (trc20Res.ok) {
      const trc20Json = await trc20Res.json();
      for (const tx of trc20Json.data || []) {
        if (tx.to === address && tx.type === 'Transfer') {
          const decimals = Number(tx.token_info?.decimals || 6);
          const amount = Number(tx.value) / Math.pow(10, decimals);
          await creditBlockchainDeposit({
            userId,
            txHash: tx.transaction_id,
            chain: 'TRX',
            asset: 'USDT',
            amountCrypto: amount
          });
        }
      }
    }

    // Check Native TRX transfers
    const trxRes = await fetch(
      `https://api.trongrid.io/v1/accounts/${address}/transactions?only_to=true&limit=10`,
      { headers, signal: AbortSignal.timeout(7000) }
    );
    if (trxRes.ok) {
      const trxJson = await trxRes.json();
      for (const tx of trxJson.data || []) {
        const contract = tx.raw_data?.contract?.[0];
        if (
          contract?.type === 'TransferContract' &&
          tx.ret?.[0]?.contractRet === 'SUCCESS'
        ) {
          const amountSun = Number(contract.parameter?.value?.amount || 0);
          const amountTrx = amountSun / 1e6;
          if (amountTrx > 0) {
            await creditBlockchainDeposit({
              userId,
              txHash: tx.txID,
              chain: 'TRX',
              asset: 'TRX',
              amountCrypto: amountTrx
            });
          }
        }
      }
    }
  } catch {
    // Ignore transient RPC network errors
  }
}

// 2. Scan Bitcoin Native SegWit (bc1q...) via Mempool.space API
async function checkBitcoinAddress(addrRow) {
  const { user_id: userId, public_address: address } = addrRow;
  try {
    const res = await fetch(`https://mempool.space/api/address/${address}/txs`, {
      signal: AbortSignal.timeout(7000)
    });
    if (!res.ok) return;

    const txs = await res.json();
    for (const tx of (txs || []).slice(0, 10)) {
      if (!tx.status?.confirmed) continue;

      let satsReceived = 0;
      for (const vout of tx.vout || []) {
        if (vout.scriptpubkey_address === address) {
          satsReceived += Number(vout.value || 0);
        }
      }

      if (satsReceived > 0) {
        const amountBtc = satsReceived / 1e8;
        await creditBlockchainDeposit({
          userId,
          txHash: tx.txid,
          chain: 'BTC',
          asset: 'BTC',
          amountCrypto: amountBtc
        });
      }
    }
  } catch {
    // Ignore transient mempool timeout
  }
}

// 3. Scan Solana Native SOL & SPL USDC via JSON-RPC (Zero @solana/web3.js bloat)
async function checkSolanaAddress(addrRow) {
  const { user_id: userId, public_address: address } = addrRow;
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

  try {
    const sigRes = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignaturesForAddress',
        params: [address, { limit: 5 }]
      }),
      signal: AbortSignal.timeout(7000)
    });

    if (!sigRes.ok) return;
    const sigJson = await sigRes.json();

    for (const sigInfo of sigJson.result || []) {
      if (sigInfo.err || sigInfo.confirmationStatus !== 'finalized') continue;

      const txRes = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'getTransaction',
          params: [
            sigInfo.signature,
            { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }
          ]
        }),
        signal: AbortSignal.timeout(7000)
      });

      if (!txRes.ok) continue;
      const txData = (await txRes.json())?.result;
      if (!txData) continue;

      const accountKeys = txData.transaction?.message?.accountKeys || [];
      const addrIndex = accountKeys.findIndex(
        (k) => (typeof k === 'string' ? k : k.pubkey) === address
      );

      if (addrIndex !== -1) {
        const preLamports = txData.meta?.preBalances?.[addrIndex] || 0;
        const postLamports = txData.meta?.postBalances?.[addrIndex] || 0;
        const diffSol = (postLamports - preLamports) / 1e9;

        if (diffSol > 0.001) {
          await creditBlockchainDeposit({
            userId,
            txHash: sigInfo.signature,
            chain: 'SOL',
            asset: 'SOL',
            amountCrypto: diffSol
          });
        }
      }

      // Check SPL USDC token balance delta
      const preTokens = txData.meta?.preTokenBalances || [];
      const postTokens = txData.meta?.postTokenBalances || [];
      for (const postTok of postTokens) {
        if (postTok.owner === address && postTok.mint === USDC_SOL_MINT) {
          const preTok = preTokens.find(
            (p) => p.accountIndex === postTok.accountIndex
          );
          const preAmt = Number(preTok?.uiTokenAmount?.uiAmount || 0);
          const postAmt = Number(postTok.uiTokenAmount?.uiAmount || 0);
          const diffUsdc = postAmt - preAmt;

          if (diffUsdc >= 2.0) {
            await creditBlockchainDeposit({
              userId,
              txHash: `${sigInfo.signature}_usdc`,
              chain: 'SOL',
              asset: 'USDC',
              amountCrypto: diffUsdc
            });
          }
        }
      }
    }
  } catch {
    // Ignore transient Solana RPC rate limit
  }
}

// 4. Scan Ethereum (ETH & ERC-20 USDT) via Etherscan / Alchemy compatible API
async function checkEthereumAddress(addrRow) {
  const { user_id: userId, public_address: address } = addrRow;
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey || apiKey.startsWith('your-')) return;

  try {
    // ERC-20 USDT transfers
    const ercRes = await fetch(
      `https://api.etherscan.io/api?module=account&action=tokentx&contractaddress=${USDT_ERC20_CONTRACT}&address=${address}&page=1&offset=10&sort=desc&apikey=${apiKey}`,
      { signal: AbortSignal.timeout(7000) }
    );
    if (ercRes.ok) {
      const ercJson = await ercRes.json();
      for (const tx of ercJson.result || []) {
        if (
          tx.to?.toLowerCase() === address.toLowerCase() &&
          Number(tx.confirmations) >= 2
        ) {
          const decimals = Number(tx.tokenDecimal || 6);
          const amount = Number(tx.value) / Math.pow(10, decimals);
          await creditBlockchainDeposit({
            userId,
            txHash: tx.hash,
            chain: 'ETH',
            asset: 'USDT',
            amountCrypto: amount
          });
        }
      }
    }
  } catch {
    // Ignore transient Etherscan error
  }
}

export async function runDepositWatcherCycle() {
  const { data: addresses, error } = await supabaseAdmin
    .from('deposit_addresses')
    .select('user_id, chain, asset, public_address')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error || !addresses?.length) return;

  for (const addrRow of addresses) {
    if (addrRow.chain === 'TRX') await checkTronAddress(addrRow);
    else if (addrRow.chain === 'BTC') await checkBitcoinAddress(addrRow);
    else if (addrRow.chain === 'SOL') await checkSolanaAddress(addrRow);
    else if (addrRow.chain === 'ETH') await checkEthereumAddress(addrRow);
  }
}

export function startDepositWatcher(intervalMs = 45000) {
  console.log(`[DepositWatcher] Polling active HD deposit addresses every ${intervalMs / 1000}s`);
  setInterval(() => {
    runDepositWatcherCycle().catch((err) =>
      console.error('[DepositWatcher] Cycle error:', err.message)
    );
  }, intervalMs);
}
