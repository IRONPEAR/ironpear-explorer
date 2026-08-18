import { ApiPromise, WsProvider } from '@polkadot/api';
import { encodeAddress } from '@polkadot/util-crypto';
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

export class IronPearClient {
  private apiPromise: Promise<ApiPromise> | null = null;

  constructor(private readonly endpoint = SOFT_TESTNET_CONFIG.rpcEndpoint) {}

  async api(): Promise<ApiPromise> {
    if (!this.apiPromise) {
      const provider = new WsProvider(this.endpoint);
      this.apiPromise = ApiPromise.create({ provider, noInitWarn: true });
    }
    return this.apiPromise;
  }

  async disconnect(): Promise<void> {
    if (this.apiPromise) {
      const api = await this.apiPromise;
      await api.disconnect();
      this.apiPromise = null;
    }
  }

  async networkSummary(): Promise<NetworkSummary> {
    const api = await this.api();
    const query = api.query as any;
    const [bestHeader, finalizedHash, totalIssuance, treasuryAccount] = await Promise.all([
      api.rpc.chain.getHeader(),
      api.rpc.chain.getFinalizedHead(),
      query.balances.totalIssuance(),
      query.system.account(SOFT_TESTNET_CONFIG.treasuryAddress)
    ]);
    const finalizedHeader = await api.rpc.chain.getHeader(finalizedHash);
    const bestBlock = bestHeader.number.toNumber();
    const finalizedBlock = finalizedHeader.number.toNumber();
    const treasuryBalance = (treasuryAccount as any).data.free.toString();

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
      totalIssuancePlanck: totalIssuance.toString(),
      treasuryAddress: SOFT_TESTNET_CONFIG.treasuryAddress,
      treasuryBalancePlanck: treasuryBalance
    };
  }

  async accountSummary(address: string): Promise<AccountSummary> {
    const api = await this.api();
    const account = await (api.query as any).system.account(address);
    const data = (account as any).data;
    return {
      address,
      label: PUBLIC_ACCOUNT_LABELS[address] ?? null,
      freePlanck: data.free.toString(),
      reservedPlanck: data.reserved.toString(),
      nonce: (account as any).nonce.toNumber()
    };
  }

  async latestBlocks(limit = 10): Promise<ExplorerBlock[]> {
    const api = await this.api();
    const header = await api.rpc.chain.getHeader();
    const best = header.number.toNumber();
    const start = Math.max(0, best - Math.max(1, Math.min(limit, 50)) + 1);
    const blocks: ExplorerBlock[] = [];
    for (let number = best; number >= start; number -= 1) {
      blocks.push(await this.blockByNumber(number));
    }
    return blocks;
  }

  async blockByNumber(number: number): Promise<ExplorerBlock> {
    const api = await this.api();
    const hash = await api.rpc.chain.getBlockHash(number);
    return this.blockByHash(hash.toHex() as HexString);
  }

  async blockByHash(hash: HexString): Promise<ExplorerBlock> {
    const api = await this.api();
    const query = api.query as any;
    const [signedBlock, events, timestampNow, finalizedHash] = await Promise.all([
      api.rpc.chain.getBlock(hash),
      query.system.events.at(hash),
      query.timestamp.now.at(hash),
      api.rpc.chain.getFinalizedHead()
    ]);
    const finalizedHeader = await api.rpc.chain.getHeader(finalizedHash);
    const header = signedBlock.block.header;
    const blockNumber = header.number.toNumber();
    const explorerEvents = decodeEvents(events as any);
    const extrinsics = decodeExtrinsics(signedBlock.block.extrinsics as any, explorerEvents);

    return {
      number: blockNumber,
      hash: header.hash.toHex() as HexString,
      parentHash: header.parentHash.toHex() as HexString,
      timestamp: timestampNow.toString(),
      finalized: blockNumber <= finalizedHeader.number.toNumber(),
      author: findRewardAuthor(explorerEvents),
      extrinsics,
      events: explorerEvents,
      transfers: findTransfers(explorerEvents),
      fees: findFees(explorerEvents),
      rewards: findRewards(explorerEvents)
    };
  }
}

function decodeEvents(records: any[]): ExplorerEvent[] {
  return records.map((record, eventIndex) => ({
    eventIndex,
    section: record.event.section,
    method: record.event.method,
    phase: record.phase?.toString?.() ?? null,
    data: record.event.data.map((item: unknown) => JSON.parse(JSON.stringify(item)))
  }));
}

function decodeExtrinsics(extrinsics: any[], events: ExplorerEvent[]): ExplorerExtrinsic[] {
  return extrinsics.map((extrinsic, index) => ({
    index,
    hash: extrinsic.hash.toHex(),
    section: extrinsic.method.section,
    method: extrinsic.method.method,
    signer: extrinsic.isSigned ? extrinsic.signer.toString() : null,
    isSigned: extrinsic.isSigned,
    success: extrinsicSuccess(index, events)
  }));
}

function extrinsicSuccess(index: number, events: ExplorerEvent[]): boolean | null {
  let status: boolean | null = null;
  for (const event of events) {
    if (event.section === 'system' && event.method === 'ExtrinsicSuccess' && eventAppliesToExtrinsic(event, index)) {
      status = true;
    }
    if (event.section === 'system' && event.method === 'ExtrinsicFailed' && eventAppliesToExtrinsic(event, index)) {
      status = false;
    }
  }
  return status;
}

function eventAppliesToExtrinsic(event: ExplorerEvent, index: number): boolean {
  return event.phase === `ApplyExtrinsic(${index})` || event.phase === `applyExtrinsic(${index})` || event.phase === `{\"applyExtrinsic\":${index}}`;
}

function findTimestamp(events: ExplorerEvent[]): string | null {
  const event = events.find((item) => item.section === 'timestamp' && item.method === 'Set');
  return event ? String(event.data[0]) : null;
}

function findRewardAuthor(events: ExplorerEvent[]): string | null {
  const event = events.find((item) => item.section === 'validatorRewards' && item.method === 'ValidatorBlockAuthoredObserved');
  const author = event?.data[0];
  return typeof author === 'string' ? author : null;
}

function findTransfers(events: ExplorerEvent[]): BlockTransfer[] {
  return events
    .filter((event) => event.section === 'balances' && event.method === 'Transfer')
    .map((event) => ({
      eventIndex: event.eventIndex,
      from: String(event.data[0]),
      to: String(event.data[1]),
      amountPlanck: String(event.data[2])
    }));
}

function findFees(events: ExplorerEvent[]): BlockFee[] {
  return events
    .filter((event) => event.section === 'transactionPayment' && event.method === 'TransactionFeePaid')
    .map((event) => ({
      eventIndex: event.eventIndex,
      payer: String(event.data[0]),
      actualFeePlanck: String(event.data[1]),
      tipPlanck: String(event.data[2] ?? '0')
    }));
}

function findRewards(events: ExplorerEvent[]): BlockReward[] {
  return events
    .filter((event) => event.section === 'validatorRewards' && event.method.toLowerCase().includes('reward'))
    .map((event) => ({
      eventIndex: event.eventIndex,
      account: String(event.data[0] ?? ''),
      amountPlanck: String(event.data[1] ?? '0'),
      event: `${event.section}.${event.method}`
    }));
}

export function normalizeAddress(address: string, ss58Prefix = SOFT_TESTNET_CONFIG.ss58Prefix): string {
  return encodeAddress(address, ss58Prefix);
}
