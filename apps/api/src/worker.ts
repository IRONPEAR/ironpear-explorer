import { IronPearClient, PUBLIC_ACCOUNT_LABELS, PUBLIC_VALIDATORS, SOFT_TESTNET_CONFIG, normalizeAddress } from '@ironpear-explorer/chain';
import { accountHistory, extrinsicByHash } from './d1.js';
import { indexFinalizedBatch } from './indexer.js';
import type { Env } from './types.js';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405);
    const url = new URL(request.url);
    const client = new IronPearClient(env.IRONPEAR_RPC_ENDPOINT ?? SOFT_TESTNET_CONFIG.rpcEndpoint);

    try {
      if (url.pathname === '/health') return json({ status: 'ok', service: 'ironpear-explorer-api' });
      if (url.pathname === '/api/network') return json(await client.networkSummary());
      if (url.pathname === '/api/labels') return json({ accounts: PUBLIC_ACCOUNT_LABELS, validators: PUBLIC_VALIDATORS });
      if (url.pathname === '/api/indexer/run-once') return json(await indexFinalizedBatch(env));

      const latestMatch = url.pathname.match(/^\/api\/blocks\/latest$/);
      if (latestMatch) {
        const limit = Number(url.searchParams.get('limit') ?? '10');
        return json(await client.latestBlocks(Number.isFinite(limit) ? limit : 10));
      }

      const blockMatch = url.pathname.match(/^\/api\/blocks\/([^/]+)$/);
      if (blockMatch?.[1]) return await blockResponse(client, blockMatch[1]);

      const accountMatch = url.pathname.match(/^\/api\/accounts\/([^/]+)$/);
      if (accountMatch?.[1]) return await accountResponse(client, env.DB, accountMatch[1]);

      const extrinsicMatch = url.pathname.match(/^\/api\/extrinsics\/(0x[0-9a-fA-F]{64})$/);
      if (extrinsicMatch?.[1]) {
        const extrinsic = await extrinsicByHash(env.DB, extrinsicMatch[1]);
        return extrinsic ? json(extrinsic) : json({ error: 'extrinsic not indexed' }, 404);
      }

      const searchMatch = url.pathname.match(/^\/api\/search\/(.+)$/);
      if (searchMatch?.[1]) return await searchResponse(env.DB, decodeURIComponent(searchMatch[1]));

      return json({ error: 'not found' }, 404);
    } finally {
      await client.disconnect();
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(indexFinalizedBatch(env));
  }
};

async function blockResponse(client: IronPearClient, id: string): Promise<Response> {
  try {
    if (/^0x[0-9a-fA-F]{64}$/.test(id)) return json(await client.blockByHash(id as `0x${string}`));
    const number = Number(id);
    if (Number.isInteger(number) && number >= 0) return json(await client.blockByNumber(number));
    return json({ error: 'block id must be a number or 32-byte hash' }, 400);
  } catch {
    return json({
      error: 'block unavailable from configured RPC',
      detail: 'The node may have pruned historical state needed to decode this block. Use the explorer index or an archive-capable RPC source for older blocks.'
    }, 502);
  }
}

async function accountResponse(client: IronPearClient, db: D1Database, address: string): Promise<Response> {
  try {
    const normalized = normalizeAddress(address);
    const summary = await client.accountSummary(normalized);
    const history = await accountHistory(db, normalized, 50);
    return json({ ...summary, history });
  } catch {
    return json({ error: 'invalid SS58 or public key address' }, 400);
  }
}

async function searchResponse(db: D1Database, term: string): Promise<Response> {
  if (/^\d+$/.test(term)) return json({ type: 'block', value: Number(term) });
  if (/^0x[0-9a-fA-F]{64}$/.test(term)) {
    const extrinsic = await extrinsicByHash(db, term);
    return json(extrinsic ? { type: 'extrinsic', value: extrinsic } : { type: 'blockHashOrUnknownHash', value: term });
  }
  try {
    return json({ type: 'account', value: normalizeAddress(term) });
  } catch {
    return json({ type: 'unknown', value: term });
  }
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}
