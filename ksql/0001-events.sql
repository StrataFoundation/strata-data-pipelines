CREATE STREAM solana_events ("type" VARCHAR, "slot" BIGINT, "blockTime" BIGINT, "blockhash" VARCHAR, "recentBlockhash" VARCHAR, "payload" VARCHAR)
WITH (kafka_topic='json.solana.events', value_format='json', partitions=1, replicas=1);

CREATE OR REPLACE STREAM spl_token_collective_events
WITH (kafka_topic='json.solana.spl_token_collective_events', value_format='json', partitions=1, replicas=1) 
AS SELECT
  "slot" AS "slot",
  "blockhash" AS "blockhash",
  "recentBlockhash" AS "recentBlockhash",
  "blockTime" AS "blockTime",
  "payload" AS "payload",
  "type" as "type"
FROM solana_events
WHERE EXTRACTJSONFIELD("payload", '$.programId') = 'TCo1sP6RwuCuyHPHjxgzcrq4dX4BKf9oRQ3aJMcdFry'
EMIT CHANGES;

CREATE OR REPLACE STREAM spl_token_bonding_events
WITH (kafka_topic='json.solana.spl_token_bonding_events', value_format='json', partitions=1, replicas=1) 
AS SELECT
  "slot" AS "slot",
  "blockhash" AS "blockhash",
  "recentBlockhash" AS "recentBlockhash",
  "blockTime" AS "blockTime",
  "payload" AS "payload",
  "type" as "type"
FROM solana_events
WHERE EXTRACTJSONFIELD("payload", '$.programId') = 'TBondz6ZwSM5fs4v2GpnVBMuwoncPkFLFR9S422ghhN'
EMIT CHANGES;

CREATE OR REPLACE STREAM spl_token_metadata_events
WITH (kafka_topic='json.solana.spl_token_metadata_events', value_format='json', partitions=1, replicas=1) 
AS SELECT
  "slot" AS "slot",
  "blockhash" AS "blockhash",
  "recentBlockhash" AS "recentBlockhash",
  "blockTime" AS "blockTime",
  "payload" AS "payload",
  "type" as "type"
FROM solana_events
WHERE EXTRACTJSONFIELD("payload", '$.programId') = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'
EMIT CHANGES;

CREATE OR REPLACE STREAM create_metadata_events
WITH (kafka_topic='json.solana.create_metadata_events', value_format='json', partitions=1, replicas=1) 
AS SELECT
  "slot" AS "slot",
  "blockhash" AS "blockhash",
  "recentBlockhash" AS "recentBlockhash",
  "blockTime" AS "blockTime",
  EXTRACTJSONFIELD("payload", '$.instructionIndex') AS "instructionIndex",
  EXTRACTJSONFIELD("payload", '$.innerIndex') AS "innerIndex",
  EXTRACTJSONFIELD("payload", '$.data.data.name') AS "name",
  EXTRACTJSONFIELD("payload", '$.data.data.symbol') AS "symbol",
  EXTRACTJSONFIELD("payload", '$.data.data.uri') AS "uri",
  EXTRACTJSONFIELD("payload", '$.data.data.sellerFeeBasisPoints') AS "sellerFeeBasisPoints",
  EXTRACTJSONFIELD("payload", '$.accounts.tokenMetadata') AS "tokenMetadata",
  EXTRACTJSONFIELD("payload", '$.accounts.mint') AS "mint",
  EXTRACTJSONFIELD("payload", '$.accounts.mintAuthority') AS "mintAuthority",
  EXTRACTJSONFIELD("payload", '$.accounts.payer') AS "payer",
  EXTRACTJSONFIELD("payload", '$.accounts.updateAuthority') AS "updateAuthority"
FROM spl_token_metadata_events
EMIT CHANGES;

CREATE OR REPLACE STREAM collective_create_unclaimed_tokens
WITH (kafka_topic='json.solana.collective_create_unclaimed_tokens', value_format='json', partitions=1, replicas=1) 
AS SELECT
  spl_token_collective_events."slot" AS "slot",
  spl_token_collective_events."blockhash" AS "blockhash",
  spl_token_collective_events."recentBlockhash" AS "recentBlockhash",
  spl_token_collective_events."blockTime" AS "blockTime",
  create_metadata_events."name" as "tokenMetadataName",
  create_metadata_events."symbol" as "tokenMetadataSymbol",
  create_metadata_events."uri" as "tokenMetadataUri",
  create_metadata_events."tokenMetadata" AS "tokenMetadata",
  EXTRACTJSONFIELD("payload", '$.instructionIndex') AS "instructionIndex",
  EXTRACTJSONFIELD("payload", '$.innerIndex') AS "innerIndex",
  EXTRACTJSONFIELD("payload", '$.data.args.nameParent') AS "nameParent",
  EXTRACTJSONFIELD("payload", '$.data.args.nameClass') AS "nameClass",
  EXTRACTJSONFIELD("payload", '$.accounts.initializeArgs.payer') AS "payer",
  EXTRACTJSONFIELD("payload", '$.accounts.initializeArgs.collective') AS "collective",
  EXTRACTJSONFIELD("payload", '$.accounts.initializeArgs.tokenBonding') AS "tokenBonding",
  EXTRACTJSONFIELD("payload", '$.accounts.initializeArgs.buyBaseRoyalties') AS "buyBaseRoyalties",
  EXTRACTJSONFIELD("payload", '$.accounts.initializeArgs.buyTargetRoyalties') AS "buyTargetRoyalties",
  EXTRACTJSONFIELD("payload", '$.accounts.initializeArgs.sellBaseRoyalties') AS "sellBaseRoyalties",
  EXTRACTJSONFIELD("payload", '$.accounts.initializeArgs.sellTargetRoyalties') AS "sellTargetRoyalties",
  EXTRACTJSONFIELD("payload", '$.accounts.initializeArgs.targetMint') AS "targetMint",
  EXTRACTJSONFIELD("payload", '$.accounts.name') AS "name",
  EXTRACTJSONFIELD("payload", '$.accounts.reverseTokenRef') AS "reverseTokenRef",
  EXTRACTJSONFIELD("payload", '$.accounts.tokenRef') AS "tokenRef"
FROM spl_token_collective_events
JOIN create_metadata_events WITHIN 2 HOURS ON create_metadata_events."tokenMetadata" = EXTRACTJSONFIELD("payload", '$.accounts.initializeArgs.tokenMetadata') 
WHERE "type" = 'initializeUnclaimedSocialTokenV0'
EMIT CHANGES;

CREATE OR REPLACE STREAM collective_create_owned_tokens
WITH (kafka_topic='json.solana.collective_create_owned_tokens', value_format='json', partitions=1, replicas=1) 
AS SELECT
  "slot" AS "slot",
  "blockhash" AS "blockhash",
  "recentBlockhash" AS "recentBlockhash",
  "blockTime" AS "blockTime",
  EXTRACTJSONFIELD("payload", '$.instructionIndex') AS "instructionIndex",
  EXTRACTJSONFIELD("payload", '$.innerIndex') AS "innerIndex",
  EXTRACTJSONFIELD("payload", '$.data.args.nameParent') AS "nameParent",
  EXTRACTJSONFIELD("payload", '$.data.args.nameClass') AS "nameClass",
  EXTRACTJSONFIELD("payload", '$.accounts.initializeArgs.payer') AS "payer",
  EXTRACTJSONFIELD("payload", '$.accounts.initializeArgs.collective') AS "collective",
  EXTRACTJSONFIELD("payload", '$.accounts.initializeArgs.tokenBonding') AS "tokenBonding",
  EXTRACTJSONFIELD("payload", '$.accounts.initializeArgs.buyBaseRoyalties') AS "buyBaseRoyalties",
  EXTRACTJSONFIELD("payload", '$.accounts.initializeArgs.buyTargetRoyalties') AS "buyTargetRoyalties",
  EXTRACTJSONFIELD("payload", '$.accounts.initializeArgs.sellBaseRoyalties') AS "sellBaseRoyalties",
  EXTRACTJSONFIELD("payload", '$.accounts.initializeArgs.sellTargetRoyalties') AS "sellTargetRoyalties",
  EXTRACTJSONFIELD("payload", '$.accounts.initializeArgs.targetMint') AS "targetMint",
  EXTRACTJSONFIELD("payload", '$.accounts.initializeArgs.tokenMetadata') AS "tokenMetadata",
  EXTRACTJSONFIELD("payload", '$.accounts.owner') AS "owner",
  EXTRACTJSONFIELD("payload", '$.accounts.reverseTokenRef') AS "reverseTokenRef",
  EXTRACTJSONFIELD("payload", '$.accounts.tokenRef') AS "tokenRef"
FROM spl_token_collective_events
WHERE "type" = 'initializeOwnedSocialTokenV0'
EMIT CHANGES;

CREATE OR REPLACE STREAM collective_token_claims
WITH (kafka_topic='json.solana.collective_token_claims', value_format='json', partitions=1, replicas=1) 
AS SELECT
  "slot" AS "slot",
  "blockhash" AS "blockhash",
  "recentBlockhash" AS "recentBlockhash",
  "blockTime" AS "blockTime",
  EXTRACTJSONFIELD("payload", '$.instructionIndex') AS "instructionIndex",
  EXTRACTJSONFIELD("payload", '$.innerIndex') AS "innerIndex",
  EXTRACTJSONFIELD("payload", '$.accounts.collective') AS "collective",
  EXTRACTJSONFIELD("payload", '$.accounts.tokenRef') AS "tokenRef",
  EXTRACTJSONFIELD("payload", '$.accounts.newTokenRef') AS "newTokenRef",
  EXTRACTJSONFIELD("payload", '$.accounts.reverseTokenRef') AS "reverseTokenRef",
  EXTRACTJSONFIELD("payload", '$.accounts.tokenBonding') AS "tokenBonding",
  EXTRACTJSONFIELD("payload", '$.accounts.tokenBondingAuthority') AS "tokenBondingAuthority",
  EXTRACTJSONFIELD("payload", '$.accounts.newBuyBaseRoyalties') AS "newBuyBaseRoyalties",
  EXTRACTJSONFIELD("payload", '$.accounts.newBuyTargetRoyalties') AS "newBuyTargetRoyalties",
  EXTRACTJSONFIELD("payload", '$.accounts.newSellBaseRoyalties') AS "newSellBaseRoyalties",
  EXTRACTJSONFIELD("payload", '$.accounts.newSellTargetRoyalties') AS "newSellTargetRoyalties",
  EXTRACTJSONFIELD("payload", '$.accounts.name') AS "name",
  EXTRACTJSONFIELD("payload", '$.accounts.owner') AS "owner"
FROM spl_token_collective_events
WHERE "type" = 'claimSocialTokenV0'
EMIT CHANGES;


CREATE OR REPLACE STREAM token_bonding_initializes
WITH (kafka_topic='json.solana.token_bonding_initializes', value_format='json', partitions=1, replicas=1) 
AS SELECT
  "slot" AS "slot",
  "blockhash" AS "blockhash",
  "recentBlockhash" AS "recentBlockhash",
  "blockTime" AS "blockTime",
  EXTRACTJSONFIELD("payload", '$.instructionIndex') AS "instructionIndex",
  EXTRACTJSONFIELD("payload", '$.innerIndex') AS "innerIndex",
  EXTRACTJSONFIELD("payload", '$.data.args.buyBaseRoyaltyPercentage') AS "buyBaseRoyaltyPercentage",
  EXTRACTJSONFIELD("payload", '$.data.args.buyTargetRoyaltyPercentage') AS "buyTargetRoyaltyPercentage",
  EXTRACTJSONFIELD("payload", '$.data.args.sellBaseRoyaltyPercentage') AS "sellBaseRoyaltyPercentage",
  EXTRACTJSONFIELD("payload", '$.data.args.sellTargetRoyaltyPercentage') AS "sellTargetRoyaltyPercentage",
  EXTRACTJSONFIELD("payload", '$.data.args.targetRoyaltyPercentage') AS "targetRoyaltyPercentage",
  EXTRACTJSONFIELD("payload", '$.data.args.mintCap') AS "mintCap",
  EXTRACTJSONFIELD("payload", '$.data.args.purchaseCap') AS "purchaseCap",
  EXTRACTJSONFIELD("payload", '$.data.args.goLiveUnixTime') AS "goLiveUnixTime",
  EXTRACTJSONFIELD("payload", '$.data.args.freezeBuyUnixTime') AS "freezeBuyUnixTime",
  EXTRACTJSONFIELD("payload", '$.data.args.generalAuthority') AS "generalAuthority",
  EXTRACTJSONFIELD("payload", '$.data.args.reserveAuthority') AS "reserveAuthority",
  EXTRACTJSONFIELD("payload", '$.data.args.curveAuthority') AS "curveAuthority",
  EXTRACTJSONFIELD("payload", '$.data.args.buyFrozen') AS "buyFrozen",
  EXTRACTJSONFIELD("payload", '$.accounts.payer') AS "payer",
  EXTRACTJSONFIELD("payload", '$.accounts.tokenBonding') AS "tokenBonding",
  EXTRACTJSONFIELD("payload", '$.accounts.curve') AS "curve",
  EXTRACTJSONFIELD("payload", '$.accounts.baseMint') AS "baseMint",
  EXTRACTJSONFIELD("payload", '$.accounts.targetMint') AS "targetMint",
  EXTRACTJSONFIELD("payload", '$.accounts.buyBaseRoyalties') AS "buyBaseRoyalties",
  EXTRACTJSONFIELD("payload", '$.accounts.buyTargetRoyalties') AS "buyTargetRoyalties",
  EXTRACTJSONFIELD("payload", '$.accounts.sellBaseRoyalties') AS "sellBaseRoyalties",
  EXTRACTJSONFIELD("payload", '$.accounts.sellTargetRoyalties') AS "sellTargetRoyalties",
  EXTRACTJSONFIELD("payload", '$.accounts.baseStorage') AS "baseStorage",
  EXTRACTJSONFIELD("payload", '$.accounts.baseStorageAuthority') AS "baseStorageAuthority"
FROM spl_token_bonding_events
WHERE "type" = 'initializeTokenBondingV0'
EMIT CHANGES;

CREATE OR REPLACE STREAM token_account_balance_changes
WITH (kafka_topic='json.solana.token_account_balance_changes', value_format='json', partitions=1, replicas=1)
AS SELECT
  solana_events."type" as "type", 
  solana_events."slot" as "slot", 
  solana_events."blockhash" as "blockhash",
  solana_events."blockTime" as "blockTime",
  solana_events."recentBlockhash" as "recentBlockhash",
  EXTRACTJSONFIELD("payload", '$.instructionIndex') AS "instructionIndex",
  EXTRACTJSONFIELD("payload", '$.innerIndex') AS "innerIndex",
  EXTRACTJSONFIELD("payload", '$.pubkey') AS "pubkey",
  EXTRACTJSONFIELD("payload", '$.mint') AS "mint",
  EXTRACTJSONFIELD("payload", '$.preAmount') AS "preAmount",
  EXTRACTJSONFIELD("payload", '$.postAmount') AS "postAmount",
  CAST(EXTRACTJSONFIELD("payload", '$.decimals') AS INTEGER) AS "decimals"
FROM solana_events
WHERE "type" = 'TokenAccountBalanceChange'
EMIT CHANGES;

CREATE OR REPLACE STREAM accounts 
WITH (kafka_topic='json.solana.accounts', value_format='json', partitions=1, replicas=1) 
AS SELECT
  "slot" AS "slot",
  "blockhash" AS "blockhash",
  "recentBlockhash" AS "recentBlockhash",
  "blockTime" AS "blockTime",
  EXTRACTJSONFIELD("payload", '$.instructionIndex') AS "instructionIndex",
  EXTRACTJSONFIELD("payload", '$.innerIndex') AS "innerIndex",
  EXTRACTJSONFIELD("payload", '$.accounts.account') AS "account",
  EXTRACTJSONFIELD("payload", '$.accounts.mint') AS "mint",
  EXTRACTJSONFIELD("payload", '$.accounts.owner') AS "owner"
FROM solana_events
WHERE "type" = 'InitializeTokenAccount'
EMIT CHANGES;
