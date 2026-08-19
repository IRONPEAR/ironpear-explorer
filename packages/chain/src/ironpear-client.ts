import { blake2AsHex, decodeAddress, encodeAddress, xxhashAsHex } from '@polkadot/util-crypto';
import type {
  AccountSummary,
  BlockFee,
  BlockReward,
  BlockTransfer,
  ExplorerBlock,
  ExplorerEvent,
  ExplorerExtrinsic,
  HexString,
  NetworkSummary
} from '@ironpear-explorer/shared';
import { PUBLIC_ACCOUNT_LABELS } from './labels.js';
import { SOFT_TESTNET_CONFIG } from './network-config.js';

interface RpcHeader {
  parentHash: HexString;
  number: string;
  stateRoot: HexString;
  extrinsicsRoot: HexString;
}

interface RpcSignedBlock {
  block: {
    header: RpcHeader;
    extrinsics: HexString[];
  };
}

export class IronPearClient {
  constructor(
    private readonly endpoint = SOFT_TESTNET_CONFIG.rpcEndpoint,
    private readonly timeoutMs = 10_000
  ) {}

  async api(): Promise<never> {
    throw new Error('IronPear Explorer uses direct HTTP JSON-RPC in Cloudflare Workers');
  }

  async disconnect(): Promise<void> {
    return;
  }

  async networkSummary(): Promise<NetworkSummary> {
    const [bestHeader, finalizedHash, totalIssuanceStorage, treasuryStorage] = await Promise.all([
      this.rpc<RpcHeader>('chain_getHeader'),
      this.rpc<HexString>('chain_getFinalizedHead'),
      this.rpc<HexString | null>('state_getStorage', [storageKey('Balances', 'TotalIssuance')]),
      this.rpc<HexString | null>('state_getStorage', [mapStorageKey('System', 'Account', decodeAddress(SOFT_TESTNET_CONFIG.treasuryAddress))])
    ]);
    const finalizedHeader = await this.rpc<RpcHeader>('chain_getHeader', [finalizedHash]);
    const bestBlock = hexNumber(bestHeader.number);
    const finalizedBlock = hexNumber(finalizedHeader.number);
    const treasuryAccount = decodeAccountInfo(treasuryStorage);

    return {
      name: SOFT_TESTNET_CONFIG.name,
      chainId: SOFT_TESTNET_CONFIG.chainId,
      protocolId: SOFT_TESTNET_CONFIG.protocolId,
      tokenSymbol: SOFT_TESTNET_CONFIG.tokenSymbol,
      tokenDecimals: SOFT_TESTNET_CONFIG.tokenDecimals,
      ss58Prefix: SOFT_TESTNET_CONFIG.ss58Prefix,
      bestBlock,
      finalizedBlock,
      finalityGap: bestBlock - finalizedBlock,
      totalIssuancePlanck: decodeU128(totalIssuanceStorage).toString(),
      treasuryAddress: SOFT_TESTNET_CONFIG.treasuryAddress,
      treasuryBalancePlanck: treasuryAccount.freePlanck
    };
  }

  async accountSummary(address: string): Promise<AccountSummary> {
    const normalized = normalizeAddress(address);
    const storage = await this.rpc<HexString | null>('state_getStorage', [mapStorageKey('System', 'Account', decodeAddress(normalized))]);
    const account = decodeAccountInfo(storage);
    return {
      address: normalized,
      label: PUBLIC_ACCOUNT_LABELS[normalized] ?? null,
      freePlanck: account.freePlanck,
      reservedPlanck: account.reservedPlanck,
      nonce: account.nonce
    };
  }

  async latestBlocks(limit = 10): Promise<ExplorerBlock[]> {
    const header = await this.rpc<RpcHeader>('chain_getHeader');
    const best = hexNumber(header.number);
    const start = Math.max(0, best - Math.max(1, Math.min(limit, 50)) + 1);
    const blocks: ExplorerBlock[] = [];
    for (let number = best; number >= start; number -= 1) {
      blocks.push(await this.blockByNumber(number));
    }
    return blocks;
  }

  async blockByNumber(number: number): Promise<ExplorerBlock> {
    const hash = await this.rpc<HexString>('chain_getBlockHash', [numberToHex(number)]);
    return this.blockByHash(hash);
  }

  async blockByHash(hash: HexString): Promise<ExplorerBlock> {
    const [signedBlock, timestampStorage, finalizedHash] = await Promise.all([
      this.rpc<RpcSignedBlock>('chain_getBlock', [hash]),
      this.rpc<HexString | null>('state_getStorage', [storageKey('Timestamp', 'Now'), hash]),
      this.rpc<HexString>('chain_getFinalizedHead')
    ]);
    const finalizedHeader = await this.rpc<RpcHeader>('chain_getHeader', [finalizedHash]);
    const header = signedBlock.block.header;
    const blockNumber = hexNumber(header.number);
    const extrinsics = signedBlock.block.extrinsics.map((encoded, index) => decodeExtrinsic(encoded, index));

    return {
      number: blockNumber,
      hash,
      parentHash: header.parentHash,
      timestamp: decodeU64(timestampStorage)?.toString() ?? null,
      finalized: blockNumber <= hexNumber(finalizedHeader.number),
      author: null,
      extrinsics,
      events: [],
      transfers: [],
      fees: [],
      rewards: []
    };
  }

  private async rpc<T>(method: string, params: unknown[] = []): Promise<T> {
    const response = await withTimeout(fetch(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: method, method, params })
    }), this.timeoutMs, `IronPear RPC ${method} timed out`);
    if (!response.ok) throw new Error(`IronPear RPC ${method} HTTP ${response.status}`);
    const payload = await response.json() as { result?: T; error?: unknown };
    if (payload.error) throw new Error(`IronPear RPC ${method} returned an error`);
    return payload.result as T;
  }
}

function decodeExtrinsic(encoded: HexString, index: number): ExplorerExtrinsic {
  return {
    index,
    hash: blake2AsHex(encoded, 256) as HexString,
    section: 'encoded',
    method: 'opaque',
    signer: null,
    isSigned: false,
    success: null
  };
}

function storageKey(pallet: string, item: string): HexString {
  return `${xxhashAsHex(pallet, 128)}${xxhashAsHex(item, 128).slice(2)}` as HexString;
}

function mapStorageKey(pallet: string, item: string, account: Uint8Array): HexString {
  return `${storageKey(pallet, item)}${blake2AsHex(account, 128).slice(2)}${bytesToHex(account).slice(2)}` as HexString;
}

function decodeAccountInfo(storage: HexString | null): { nonce: number; freePlanck: string; reservedPlanck: string } {
  if (!storage) return { nonce: 0, freePlanck: '0', reservedPlanck: '0' };
  const bytes = hexToBytes(storage);
  return {
    nonce: readU32(bytes, 0),
    freePlanck: readU128(bytes, 16).toString(),
    reservedPlanck: readU128(bytes, 32).toString()
  };
}

function decodeU128(storage: HexString | null): bigint {
  if (!storage) return 0n;
  return readU128(hexToBytes(storage), 0);
}

function decodeU64(storage: HexString | null): bigint | null {
  if (!storage) return null;
  const bytes = hexToBytes(storage);
  let value = 0n;
  for (let i = 7; i >= 0; i -= 1) value = (value << 8n) + BigInt(bytes[i] ?? 0);
  return value;
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) + ((bytes[offset + 1] ?? 0) << 8) + ((bytes[offset + 2] ?? 0) << 16) + ((bytes[offset + 3] ?? 0) << 24);
}

function readU128(bytes: Uint8Array, offset: number): bigint {
  let value = 0n;
  for (let i = 15; i >= 0; i -= 1) value = (value << 8n) + BigInt(bytes[offset + i] ?? 0);
  return value;
}

function hexNumber(value: string): number {
  return Number.parseInt(value, 16);
}

function numberToHex(value: number): string {
  return `0x${value.toString(16)}`;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function bytesToHex(bytes: Uint8Array): HexString {
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function normalizeAddress(address: string, ss58Prefix = SOFT_TESTNET_CONFIG.ss58Prefix): string {
  return encodeAddress(address, ss58Prefix);
}
