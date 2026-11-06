import crypto from 'node:crypto';
import * as bip39 from 'bip39';
import { BIP32Factory } from 'bip32';
import * as ecc from 'tiny-secp256k1';
import * as bitcoin from 'bitcoinjs-lib';
import { HDNodeWallet, computeAddress } from 'ethers';
import { derivePath } from 'ed25519-hd-key';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { supabaseAdmin } from '../config/supabaseAdmin.js';

const bip32 = BIP32Factory(ecc);

function getMasterSeed() {
  const mnemonic = process.env.MASTER_WALLET_MNEMONIC?.trim();
  if (!mnemonic || !bip39.validateMnemonic(mnemonic)) {
    throw new Error('Invalid or missing MASTER_WALLET_MNEMONIC in server/.env');
  }
  return { mnemonic, seedBuffer: bip39.mnemonicToSeedSync(mnemonic) };
}

// Base58Check encoder for Tron (0x41 + 20-byte EVM address + 4-byte double-SHA256 checksum)
function encodeTronBase58Check(evmHexAddress) {
  const cleanHex = evmHexAddress.replace(/^0x/i, '').toLowerCase();
  const payload = Buffer.from(`41${cleanHex}`, 'hex');
  const hash1 = crypto.createHash('sha256').update(payload).digest();
  const hash2 = crypto.createHash('sha256').update(hash1).digest();
  const checksum = hash2.subarray(0, 4);
  return bs58.encode(Buffer.concat([payload, checksum]));
}

export function deriveChainAddress(chain, index) {
  const { mnemonic, seedBuffer } = getMasterSeed();
  const idx = Number(index);

  if (!Number.isInteger(idx) || idx < 0) {
    throw new Error(`Invalid derivation index: ${index}`);
  }

  switch (chain.toUpperCase()) {
    case 'ETH': {
      const path = `m/44'/60'/0'/0/${idx}`;
      const wallet = HDNodeWallet.fromPhrase(mnemonic, '', path);
      return { chain: 'ETH', path, address: wallet.address };
    }

    case 'TRX': {
      const path = `m/44'/195'/0'/0/${idx}`;
      const wallet = HDNodeWallet.fromPhrase(mnemonic, '', path);
      const evmAddress = computeAddress(wallet.publicKey);
      const tronAddress = encodeTronBase58Check(evmAddress);
      return { chain: 'TRX', path, address: tronAddress };
    }

    case 'SOL': {
      const path = `m/44'/501'/${idx}'/0'`;
      const { key } = derivePath(path, seedBuffer.toString('hex'));
      const keypair = nacl.sign.keyPair.fromSeed(Uint8Array.from(key));
      const solAddress = bs58.encode(keypair.publicKey);
      return { chain: 'SOL', path, address: solAddress };
    }

    case 'BTC': {
      const path = `m/84'/0'/0'/0/${idx}`;
      const root = bip32.fromSeed(seedBuffer);
      const child = root.derivePath(path);
      const { address } = bitcoin.payments.p2wpkh({
        pubkey: Buffer.from(child.publicKey),
        network: bitcoin.networks.bitcoin
      });
      return { chain: 'BTC', path, address };
    }

    default:
      throw new Error(`Unsupported blockchain network: ${chain}`);
  }
}

export async function getOrCreateUserDepositAddress(userId, chain, asset) {
  const normalizedChain = chain.toUpperCase();
  const normalizedAsset = asset.toUpperCase();

  // 1. Check if address already exists for this user + chain
  const { data: existing } = await supabaseAdmin
    .from('deposit_addresses')
    .select('public_address, derivation_path')
    .eq('user_id', userId)
    .eq('chain', normalizedChain)
    .maybeSingle();

  if (existing?.public_address) {
    return {
      chain: normalizedChain,
      asset: normalizedAsset,
      address: existing.public_address,
      derivationPath: existing.derivation_path
    };
  }

  // 2. Fetch user's deterministic derivation_index
  const { data: userRow, error: userErr } = await supabaseAdmin
    .from('users')
    .select('derivation_index')
    .eq('id', userId)
    .single();

  if (userErr || !userRow) {
    throw new Error('User record not found for HD address derivation.');
  }

  // 3. Derive deterministic public address
  const derived = deriveChainAddress(normalizedChain, userRow.derivation_index);

  // 4. Persist in public.deposit_addresses
  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('deposit_addresses')
    .upsert(
      {
        user_id: userId,
        chain: normalizedChain,
        asset: normalizedAsset,
        derivation_path: derived.path,
        public_address: derived.address
      },
      { onConflict: 'user_id,chain' }
    )
    .select('public_address, derivation_path')
    .single();

  if (insertErr) throw new Error(insertErr.message);

  return {
    chain: normalizedChain,
    asset: normalizedAsset,
    address: inserted.public_address,
    derivationPath: inserted.derivation_path
  };
}