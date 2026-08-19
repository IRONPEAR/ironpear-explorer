import { IronPearClient } from '@ironpear-explorer/chain';
import { lastIndexedBlock, setLastIndexedBlock } from './d1.js';
import type { Env } from './types.js';

export async function indexFinalizedBatch(env: Env): Promise<{ indexed: number; from: number | null; to: number | null; finalized: number }> {
  const client = new IronPearClient(env.IRONPEAR_RPC_ENDPOINT);
  const limit = boundedBatchLimit(env.INDEX_BATCH_LIMIT);
  try {
    const finalized = (await client.networkSummary()).finalizedBlock;
    const current = await lastIndexedBlock(env.DB);
    const from = current + 1;
    const to = Math.min(finalized, from + limit - 1);

    if (from > to) return { indexed: 0, from: null, to: null, finalized };

    for (let number = from; number <= to; number += 1) {
      const block = await client.blockByNumber(number);
      await writeBlock(env.DB, block);
      await setLastIndexedBlock(env.DB, number);
    }

    return { indexed: to - from + 1, from, to, finalized };
  } finally {
    await client.disconnect();
  }
}

async function writeBlock(db: D1Database, block: Awaited<ReturnType<IronPearClient['blockByNumber']>>): Promise<void> {
  const statements: D1PreparedStatement[] = [
    db.prepare('insert or ignore into blocks(number, hash, parent_hash, timestamp, finalized) values (?1, ?2, ?3, ?4, ?5)')
      .bind(block.number, block.hash, block.parentHash, block.timestamp, block.finalized ? 1 : 0)
  ];

  for (const extrinsic of block.extrinsics) {
    statements.push(
      db.prepare('insert or ignore into extrinsics(hash, block_number, extrinsic_index, section, method, signer, success) values (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
        .bind(extrinsic.hash, block.number, extrinsic.index, extrinsic.section, extrinsic.method, extrinsic.signer, extrinsic.success === null ? null : extrinsic.success ? 1 : 0)
    );
  }
  for (const transfer of block.transfers) {
    statements.push(
      db.prepare('insert or ignore into transfers(block_number, event_index, sender, recipient, amount_planck) values (?1, ?2, ?3, ?4, ?5)')
        .bind(block.number, transfer.eventIndex, transfer.from, transfer.to, transfer.amountPlanck)
    );
  }
  for (const fee of block.fees) {
    statements.push(
      db.prepare('insert or ignore into fees(block_number, event_index, payer, actual_fee_planck, tip_planck) values (?1, ?2, ?3, ?4, ?5)')
        .bind(block.number, fee.eventIndex, fee.payer, fee.actualFeePlanck, fee.tipPlanck)
    );
  }
  for (const reward of block.rewards) {
    statements.push(
      db.prepare('insert or ignore into rewards(block_number, event_index, account, amount_planck, event) values (?1, ?2, ?3, ?4, ?5)')
        .bind(block.number, reward.eventIndex, reward.account, reward.amountPlanck, reward.event)
    );
  }

  await db.batch(statements);
}

function boundedBatchLimit(value: string | undefined): number {
  const parsed = Number(value ?? '10');
  if (!Number.isInteger(parsed) || parsed < 1) return 10;
  return Math.min(parsed, 10);
}
