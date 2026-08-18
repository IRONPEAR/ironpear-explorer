# Operations Notes

Recommended public deployment without an extra VPS:

1. Build and deploy `apps/web/dist` to Cloudflare Pages for `explorer.ironpear.org`.
2. Deploy `apps/api` as a Cloudflare Worker bound to the same `/api/*` route.
3. Create a D1 database named `ironpear_explorer` and replace the placeholder `database_id` in `apps/api/wrangler.toml` before deployment.
4. Apply D1 migrations from `apps/api/migrations`.
5. Let the Worker connect outbound to `wss://rpc-stn.ironpear.org`.
6. Run scheduled indexing every five minutes with `INDEX_BATCH_LIMIT=5` by default.

For full historical backfill from genesis, use an archive-capable RPC source. A pruned public RPC can support recent blocks and forward indexing, but old block event state may be unavailable.

The explorer can be rebuilt or reindexed from public chain data. It does not require secrets.
