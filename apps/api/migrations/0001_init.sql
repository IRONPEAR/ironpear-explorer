create table if not exists blocks(
  number integer primary key,
  hash text not null unique,
  parent_hash text not null,
  timestamp text,
  finalized integer not null
);

create table if not exists extrinsics(
  hash text primary key,
  block_number integer not null,
  extrinsic_index integer not null,
  section text not null,
  method text not null,
  signer text,
  success integer
);

create table if not exists transfers(
  id integer primary key autoincrement,
  block_number integer not null,
  event_index integer not null,
  sender text not null,
  recipient text not null,
  amount_planck text not null,
  unique(block_number, event_index)
);

create table if not exists fees(
  id integer primary key autoincrement,
  block_number integer not null,
  event_index integer not null,
  payer text not null,
  actual_fee_planck text not null,
  tip_planck text not null,
  unique(block_number, event_index)
);

create table if not exists rewards(
  id integer primary key autoincrement,
  block_number integer not null,
  event_index integer not null,
  account text not null,
  amount_planck text not null,
  event text not null,
  unique(block_number, event_index)
);

create index if not exists idx_blocks_hash on blocks(hash);
create index if not exists idx_transfers_sender on transfers(sender, block_number);
create index if not exists idx_transfers_recipient on transfers(recipient, block_number);
create index if not exists idx_extrinsics_block on extrinsics(block_number, extrinsic_index);

create table if not exists indexer_state(
  key text primary key,
  value text not null
);

insert or ignore into indexer_state(key, value) values ('last_indexed_block', '-1');
