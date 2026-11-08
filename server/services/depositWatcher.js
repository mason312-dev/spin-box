import bs58 from 'bs58';
import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { getAssetUsdPrice } from './priceOracle.js';

const USDT_TRC20_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const USDC_SOL_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDT_ERC20_CONTRACT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';

// Credit verified blockchain deposit via atomic Supabase RPC
async function creditBlockchainDeposit({
  userId,
  txHash,
  chain,
  asset,
  amountCrypto
}) {
  if (typeof txHash !== 'string' || !txHash || !Number.isFinite(amountCrypto) || amountCrypto <= 0) return;
  const priceUsd = await getAssetUsdPrice(asset);
  const amountUsd = Number((Number(amountCrypto) * priceUsd).toFixed(2));

  if (!Number.isFinite(amountUsd) || amountUsd < 2.00) {
    return { credited: false, reason: 'BELOW_MINIMUM_2_USD', amountUsd };
  }

  // Older webhook credits used the unsuffixed Solana signature for USDC.
  if (chain === 'SOL' && asset === 'USDC') {
    const { data: legacy, error } = await supabaseAdmin.from('deposits').select('id')
      .eq('tx_hash', txHash.slice(0, -'_usdc'.length)).eq('chain', chain).eq('asset', asset).maybeSingle();
    if (error) throw new Error(error.message);
    if (legacy) return { credited: false, reason: 'ALREADY_CREDITED' };
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
    if (error.code === '23505') {
      const { data: existing } = await supabaseAdmin.from('deposits').select('id')
        .eq('tx_hash', txHash).maybeSingle();
      if (existing) return { credited: false, reason: 'ALREADY_CREDITED' };
    }
    throw new Error(error.message);
  }

  return data;
}

// 1. Scan TronGrid for TRX & TRC-20 USDT transfers
async function checkTronAddress(addrRow) {
  const { user_id: userId, public_address: address } = addrRow;
  const headers = process.env.TRONGRID_API_KEY
    ? { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY }
    : {};

  const hexAddress = Buffer.from(bs58.decode(address).slice(0, 21)).toString('hex');

  try {
    // Check TRC-20 USDT transfers
    const trc20Res = await fetch(
      `https://api.trongrid.io/v1/accounts/${address}/transactions/trc20?only_confirmed=true&only_to=true&limit=10&contract_address=${USDT_TRC20_CONTRACT}`,
      { headers, signal: AbortSignal.timeout(7000) }
    );
    if (!trc20Res.ok) throw new Error(`TRC-20 HTTP ${trc20Res.status}`);
    const trc20Json = await trc20Res.json();
    for (const tx of trc20Json.data || []) {
      if (tx.to === address && tx.type === 'Transfer' && tx.token_info?.address === USDT_TRC20_CONTRACT) {
        const amount = Number(tx.value) / 1e6;
        await creditBlockchainDeposit({
          userId,
          txHash: tx.transaction_id,
          chain: 'TRX',
          asset: 'USDT',
          amountCrypto: amount
        });
      }
    }

    // Check Native TRX transfers
    const trxRes = await fetch(
      `https://api.trongrid.io/v1/accounts/${address}/transactions?only_confirmed=true&only_to=true&limit=10`,
      { headers, signal: AbortSignal.timeout(7000) }
    );
    if (!trxRes.ok) throw new Error(`TRX HTTP ${trxRes.status}`);
    const trxJson = await trxRes.json();
    for (const tx of trxJson.data || []) {
      const contract = tx.raw_data?.contract?.[0];
      if (
        contract?.type === 'TransferContract' &&
        contract.parameter?.value?.to_address?.toLowerCase() === hexAddress &&
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
  } catch (error) {
    throw new Error('TRON scan failed', { cause: error });
  }
}

// 2. Scan Bitcoin Native SegWit (bc1q...) via Mempool.space API
async function checkBitcoinAddress(addrRow) {
  const { user_id: userId, public_address: address } = addrRow;
  try {
    const res = await fetch(`https://mempool.space/api/address/${address}/txs`, {
      signal: AbortSignal.timeout(7000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

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
  } catch (error) {
    throw new Error('Bitcoin scan failed', { cause: error });
  }
}

// 3. Scan Solana Native SOL & SPL USDC via JSON-RPC (Zero @solana/web3.js bloat)
async function checkSolanaAddress(addrRow) {
  const { user_id: userId, public_address: address } = addrRow;
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

  async function rpc(method, params) {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(7000)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.error) throw new Error(payload.error.message);
    return payload.result;
  }

  try {
    const accounts = await rpc('getTokenAccountsByOwner', [
      address, { mint: USDC_SOL_MINT }, { encoding: 'base64', commitment: 'finalized' }
    ]);
    const signatures = new Map();
    for (const account of [address, ...accounts.value.map(({ pubkey }) => pubkey)]) {
      const results = await rpc('getSignaturesForAddress', [account, { limit: 5, commitment: 'finalized' }]);
      for (const info of results) signatures.set(info.signature, info);
    }

    for (const sigInfo of signatures.values()) {
      if (sigInfo.err || sigInfo.confirmationStatus !== 'finalized') continue;

      const txData = await rpc('getTransaction', [
        sigInfo.signature,
        { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'finalized' }
      ]);
      if (!txData?.meta || txData.meta.err !== null) continue;

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

      // Add the owner's raw token balances across accounts before comparing the two snapshots.
      const totalUsdc = (tokens) => (tokens ?? [])
        .filter((token) => token.owner === address && token.mint === USDC_SOL_MINT)
        .reduce((total, token) => total + BigInt(token.uiTokenAmount.amount), 0n);
      const receivedUsdc = totalUsdc(txData.meta.postTokenBalances) - totalUsdc(txData.meta.preTokenBalances);
      if (receivedUsdc > 0n) {
        await creditBlockchainDeposit({
          userId,
          txHash: `${sigInfo.signature}_usdc`,
          chain: 'SOL',
          asset: 'USDC',
          amountCrypto: Number(receivedUsdc) / 1e6
        });
      }
    }
  } catch (error) {
    throw new Error('Solana scan failed', { cause: error });
  }
}

// 4. Scan ERC-20 USDT transfers via Etherscan.
async function checkEthereumAddress(addrRow) {
  const { user_id: userId, public_address: address } = addrRow;
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey || apiKey.startsWith('your-')) throw new Error('ETHERSCAN_API_KEY is required to monitor Ethereum deposits.');

  try {
    // ERC-20 USDT transfers
    const ercRes = await fetch(
      `https://api.etherscan.io/v2/api?chainid=1&module=account&action=tokentx&contractaddress=${USDT_ERC20_CONTRACT}&address=${address}&page=1&offset=10&sort=desc&apikey=${apiKey}`,
      { signal: AbortSignal.timeout(7000) }
    );
    if (!ercRes.ok) throw new Error(`HTTP ${ercRes.status}`);
    const ercJson = await ercRes.json();
    if (!Array.isArray(ercJson.result)) throw new Error('Etherscan did not return a transfer list.');
    for (const tx of ercJson.result) {
      if (
        tx.to?.toLowerCase() === address.toLowerCase() &&
        tx.contractAddress?.toLowerCase() === USDT_ERC20_CONTRACT.toLowerCase() &&
        Number(tx.confirmations) >= 2
      ) {
        const amount = Number(tx.value) / 1e6;
        await creditBlockchainDeposit({
          userId,
          txHash: tx.hash,
          chain: 'ETH',
          asset: 'USDT',
          amountCrypto: amount
        });
      }
    }
  } catch (error) {
    throw new Error('Ethereum scan failed', { cause: error });
  }
}

const scanners = new Map([
  ['TRX', checkTronAddress],
  ['BTC', checkBitcoinAddress],
  ['SOL', checkSolanaAddress],
  ['ETH', checkEthereumAddress],
]);
const activeScans = new Map();

export async function scanDepositAddress(row) {
  const scanner = scanners.get(row.chain);
  if (!scanner) return;
  const key = row.id;
  if (activeScans.has(key)) return activeScans.get(key);

  const scan = scanner(row);
  activeScans.set(key, scan);
  try {
    await scan;
  } finally {
    activeScans.delete(key);
  }
}

export async function runDepositWatcherCycle() {
  const pageSize = 100;
  let lastId;
  while (true) {
    let query = supabaseAdmin.from('deposit_addresses')
      .select('id, user_id, chain, public_address')
      .order('id').limit(pageSize);
    if (lastId) query = query.gt('id', lastId);
    const { data: addresses, error } = await query;
    if (error) throw new Error(error.message);

    for (const address of addresses) {
      try {
        await scanDepositAddress(address);
      } catch (error) {
        console.error('[DepositWatcher] Address scan failed:', address.id, error.cause?.message || error.message);
      }
    }
    if (addresses.length < pageSize) return;
    lastId = addresses.at(-1).id;
  }
}

export function startDepositWatcher(intervalMs = 45000) {
  console.log(`[DepositWatcher] Waiting ${intervalMs / 1000}s between deposit scans`);
  async function poll() {
    try {
      await runDepositWatcherCycle();
    } catch (error) {
      console.error('[DepositWatcher] Cycle error:', error.message);
    } finally {
      setTimeout(poll, intervalMs);
    }
  }
  void poll();
}
