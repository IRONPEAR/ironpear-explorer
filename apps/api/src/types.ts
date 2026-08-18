export interface Env {
  DB: D1Database;
  IRONPEAR_RPC_ENDPOINT?: string;
  INDEX_BATCH_LIMIT?: string;
}

export interface ExtrinsicRow {
  hash: string;
  block_number: number;
  extrinsic_index: number;
  section: string;
  method: string;
  signer: string | null;
  success: number | null;
}

export interface AccountHistoryRow {
  id: number;
  block_number: number;
  sender: string;
  recipient: string;
  amount_planck: string;
}
