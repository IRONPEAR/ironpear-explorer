import type { AccountHistoryRow, ExtrinsicRow } from './types.js';

export async function extrinsicByHash(db: D1Database, hash: string): Promise<ExtrinsicRow | null> {
  return db.prepare('select * from extrinsics where hash = ?1').bind(hash).first<ExtrinsicRow>();
}

export async function accountHistory(db: D1Database, address: string, limit: number): Promise<AccountHistoryRow[]> {
  const result = await db
    .prepare('select * from transfers where sender = ?1 or recipient = ?1 order by block_number desc, id desc limit ?2')
    .bind(address, limit)
    .all<AccountHistoryRow>();
  return result.results ?? [];
}

export async function lastIndexedBlock(db: D1Database): Promise<number> {
  const row = await db.prepare("select value from indexer_state where key = 'last_indexed_block'").first<{ value: string }>();
  return row ? Number(row.value) : -1;
}

export async function setLastIndexedBlock(db: D1Database, blockNumber: number): Promise<void> {
  await db
    .prepare("insert into indexer_state(key, value) values ('last_indexed_block', ?1) on conflict(key) do update set value = excluded.value")
    .bind(String(blockNumber))
    .run();
}
