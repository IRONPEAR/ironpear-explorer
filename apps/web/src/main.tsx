import React from 'react';
import { createRoot } from 'react-dom/client';
import type { AccountSummary, ExplorerBlock, NetworkSummary } from '@ironpear-explorer/shared';
import './styles.css';

const apiBase = import.meta.env.VITE_EXPLORER_API_BASE ?? '';

type SearchResult =
  | { type: 'block'; value: number }
  | { type: 'account'; value: string }
  | { type: 'extrinsic'; value: unknown }
  | { type: 'blockHashOrUnknownHash'; value: string }
  | { type: 'unknown'; value: string };

function App() {
  const [network, setNetwork] = React.useState<NetworkSummary | null>(null);
  const [blocks, setBlocks] = React.useState<ExplorerBlock[]>([]);
  const [selectedBlock, setSelectedBlock] = React.useState<ExplorerBlock | null>(null);
  const [selectedAccount, setSelectedAccount] = React.useState<AccountSummary | null>(null);
  const [search, setSearch] = React.useState('');
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 6000);
    return () => window.clearInterval(timer);
  }, []);

  async function refresh() {
    const [networkResponse, blocksResponse] = await Promise.all([
      fetch(`${apiBase}/api/network`),
      fetch(`${apiBase}/api/blocks/latest?limit=8`)
    ]);
    const nextNetwork = await networkResponse.json();
    const nextBlocks = await blocksResponse.json();
    setNetwork(nextNetwork);
    setBlocks(nextBlocks);
    if (!selectedBlock && nextBlocks[0]) setSelectedBlock(nextBlocks[0]);
  }

  async function loadBlock(id: string | number) {
    setMessage(null);
    const response = await fetch(`${apiBase}/api/blocks/${encodeURIComponent(String(id))}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'block lookup failed' }));
      setMessage(error.detail ?? error.error ?? 'block lookup failed');
      return;
    }
    setSelectedAccount(null);
    setSelectedBlock(await response.json());
  }

  async function loadAccount(address: string) {
    setMessage(null);
    const response = await fetch(`${apiBase}/api/accounts/${encodeURIComponent(address)}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'account lookup failed' }));
      setMessage(error.error ?? 'account lookup failed');
      return;
    }
    setSelectedBlock(null);
    setSelectedAccount(await response.json());
  }

  async function runSearch(event: React.FormEvent) {
    event.preventDefault();
    const term = search.trim();
    if (!term) return;
    const response = await fetch(`${apiBase}/api/search/${encodeURIComponent(term)}`);
    const result = (await response.json()) as SearchResult;
    if (result.type === 'block' || result.type === 'blockHashOrUnknownHash') return loadBlock(result.value);
    if (result.type === 'account') return loadAccount(result.value);
    if (result.type === 'extrinsic') {
      setMessage('Extrinsic lookup is available after the indexer has recorded the transaction.');
      return;
    }
    setMessage('No block, extrinsic, or account match found.');
  }

  return (
    <main>
      <header>
        <p className="eyebrow">IronPear Explorer V1</p>
        <h1>IronPear Soft Testnet</h1>
        <p className="subtle">Read-only public explorer for PRM blocks, transfers, fees, rewards, and account balances.</p>
      </header>

      <section className="grid" aria-label="Home metrics">
        <Metric label="Best block" value={network?.bestBlock ?? '-'} />
        <Metric label="Finalized block" value={network?.finalizedBlock ?? '-'} />
        <Metric label="Finality gap" value={network?.finalityGap ?? '-'} />
        <Metric label="Total issuance" value={formatPlanck(network?.totalIssuancePlanck, network?.tokenDecimals, network?.tokenSymbol)} />
      </section>

      <form onSubmit={runSearch} className="search">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search block number, hash, extrinsic hash, or SS58 address" />
        <button>Search</button>
      </form>
      {message ? <p className="notice">{message}</p> : null}

      <section className="panel">
        <h2>Network</h2>
        <dl>
          <dt>Chain</dt><dd>{network?.name ?? '-'}</dd>
          <dt>Chain ID</dt><dd>{network?.chainId ?? '-'}</dd>
          <dt>Protocol ID</dt><dd>{network?.protocolId ?? '-'}</dd>
          <dt>Treasury</dt><dd>{network?.treasuryAddress ?? '-'}</dd>
          <dt>Treasury balance</dt><dd>{formatPlanck(network?.treasuryBalancePlanck, network?.tokenDecimals, network?.tokenSymbol)}</dd>
        </dl>
      </section>

      <section>
        <h2>Latest Blocks</h2>
        <div className="table">
          {blocks.map((block) => (
            <button key={block.hash} className="row" onClick={() => loadBlock(block.hash)}>
              <strong>#{block.number}</strong>
              <span>{block.hash}</span>
              <span>{block.extrinsics.length} extrinsics</span>
              <span>{block.transfers.length} transfers</span>
              <span>{block.finalized ? 'finalized' : 'best only'}</span>
            </button>
          ))}
        </div>
      </section>

      {selectedBlock ? <BlockDetails block={selectedBlock} network={network} /> : null}
      {selectedAccount ? <AccountDetails account={selectedAccount} network={network} /> : null}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="card"><span>{label}</span><strong>{value}</strong></div>;
}

function BlockDetails({ block, network }: { block: ExplorerBlock; network: NetworkSummary | null }) {
  return (
    <section className="panel">
      <h2>Block #{block.number}</h2>
      <dl>
        <dt>Hash</dt><dd>{block.hash}</dd>
        <dt>Parent</dt><dd>{block.parentHash}</dd>
        <dt>Finalized</dt><dd>{block.finalized ? 'yes' : 'no'}</dd>
        <dt>Author</dt><dd>{block.author ?? 'unknown'}</dd>
        <dt>Extrinsics</dt><dd>{block.extrinsics.length}</dd>
        <dt>Transfers</dt><dd>{block.transfers.length}</dd>
        <dt>Fees</dt><dd>{block.fees.length}</dd>
        <dt>Rewards</dt><dd>{block.rewards.map((reward) => `${formatPlanck(reward.amountPlanck, network?.tokenDecimals, network?.tokenSymbol)} to ${reward.account}`).join(', ') || 'none'}</dd>
      </dl>
    </section>
  );
}

function AccountDetails({ account, network }: { account: AccountSummary; network: NetworkSummary | null }) {
  return (
    <section className="panel">
      <h2>{account.label ?? 'Account'}</h2>
      <dl>
        <dt>Address</dt><dd>{account.address}</dd>
        <dt>Free</dt><dd>{formatPlanck(account.freePlanck, network?.tokenDecimals, network?.tokenSymbol)}</dd>
        <dt>Reserved</dt><dd>{formatPlanck(account.reservedPlanck, network?.tokenDecimals, network?.tokenSymbol)}</dd>
        <dt>Nonce</dt><dd>{account.nonce}</dd>
      </dl>
    </section>
  );
}

function formatPlanck(value: string | undefined, decimals = 12, symbol = 'PRM') {
  if (!value) return '-';
  const padded = value.padStart(decimals + 1, '0');
  const whole = padded.slice(0, -decimals);
  const fractional = padded.slice(-decimals).replace(/0+$/, '').slice(0, 6);
  return `${whole}${fractional ? `.${fractional}` : ''} ${symbol}`;
}

createRoot(document.getElementById('root')!).render(<App />);
