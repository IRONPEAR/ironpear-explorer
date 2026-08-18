export type HexString = `0x${string}`;

export interface NetworkSummary {
  name: string;
  chainId: string;
  protocolId: string;
  tokenSymbol: string;
  tokenDecimals: number;
  ss58Prefix: number;
  bestBlock: number;
  finalizedBlock: number;
  finalityGap: number;
  totalIssuancePlanck: string;
  treasuryAddress: string;
  treasuryBalancePlanck: string;
}

export interface BlockTransfer {
  eventIndex: number;
  from: string;
  to: string;
  amountPlanck: string;
}

export interface BlockFee {
  eventIndex: number;
  payer: string;
  actualFeePlanck: string;
  tipPlanck: string;
}

export interface BlockReward {
  eventIndex: number;
  account: string;
  amountPlanck: string;
  event: string;
}

export interface ExplorerEvent {
  eventIndex: number;
  section: string;
  method: string;
  phase: string | null;
  data: unknown[];
}

export interface ExplorerExtrinsic {
  index: number;
  hash: HexString;
  section: string;
  method: string;
  signer: string | null;
  isSigned: boolean;
  success: boolean | null;
}

export interface ExplorerBlock {
  number: number;
  hash: HexString;
  parentHash: HexString;
  timestamp: string | null;
  finalized: boolean;
  author: string | null;
  extrinsics: ExplorerExtrinsic[];
  events: ExplorerEvent[];
  transfers: BlockTransfer[];
  fees: BlockFee[];
  rewards: BlockReward[];
}

export interface AccountSummary {
  address: string;
  label: string | null;
  freePlanck: string;
  reservedPlanck: string;
  nonce: number;
}
