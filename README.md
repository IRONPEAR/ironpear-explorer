# IronPear Explorer V1

A small read-only public explorer for the IronPear soft-testnet.

## Scope

Explorer V1 reads public chain data only. It has no wallet, no signing, no transaction submission, no governance controls, no faucet controls, and no operator key material.

Default public chain endpoint:

```text
wss://rpc-stn.ironpear.org
```

## Cloudflare Architecture

- `apps/web`: Vite/React static frontend for Cloudflare Pages.
- `apps/api`: Cloudflare Worker exposing read-only `/api/*` routes and scheduled finalized-block indexing.
- `apps/api/migrations`: Cloudflare D1 schema migrations.
- `packages/chain`: shared IronPear RPC client and decoding helpers.
- `packages/shared`: shared API types.
- `config`: public network and account labels only.

The browser uses the explorer API, not raw node RPC. This keeps unsafe RPC methods and node implementation details away from public UI code.

Recent block pages can be served directly from RPC. Reliable full-history block/event lookup requires the D1 index and an archive-capable source, or an indexer that starts before relevant state is pruned.

## Local Development

```bash
npm install
npm run typecheck
npm run build
npm run d1:migrations:apply:local -w @ironpear-explorer/api
npm run dev:api
npm run dev:web
```

## Security

Never place seeds, private keys, keystores, SSH keys, faucet signing material, council signing material, validator keys, node private keys, or private operator notes in this repository.
