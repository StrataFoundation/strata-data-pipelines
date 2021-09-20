CREATE STREAM solana_events ("type" VARCHAR, "slot" BIGINT, "blockTime" BIGINT, "blockhash" VARCHAR, "recentBlockhash" VARCHAR, "payload" VARCHAR)
WITH (kafka_topic='json.solana.events', value_format='json', partitions=1);

CREATE OR REPLACE STREAM spl_wumbo_events
WITH (kafka_topic='json.solana.spl_wumbo_events', value_format='json', partitions=1) 
AS SELECT
  "slot" AS "slot",
  "blockhash" AS "blockhash",
  "recentBlockhash" AS "recentBlockhash",
  "blockTime" AS "blockTime",
  "payload" AS "payload",
  "type" as "type"
FROM solana_events
WHERE EXTRACTJSONFIELD("payload", '$.programId') = 'Bn6owcizWtLgeKcVyXVgUgTvbLezCVz9Q7oPdZu5bC1H'
EMIT CHANGES;

CREATE OR REPLACE STREAM spl_token_bonding_events
WITH (kafka_topic='json.solana.spl_token_bonding_events', value_format='json', partitions=1) 
AS SELECT
  "slot" AS "slot",
  "blockhash" AS "blockhash",
  "recentBlockhash" AS "recentBlockhash",
  "blockTime" AS "blockTime",
  "payload" AS "payload",
  "type" as "type"
FROM solana_events
WHERE EXTRACTJSONFIELD("payload", '$.programId') = 'CJMw4wALbZJswJCxLsYUj2ExGCaEgMAp8JSGjodbxAF4'
EMIT CHANGES;

CREATE OR REPLACE STREAM wumbo_create_unclaimed_tokens
WITH (kafka_topic='json.solana.wumbo_create_unclaimed_tokens', value_format='json', partitions=1) 
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
  EXTRACTJSONFIELD("payload", '$.accounts.initializeArgs.wumbo') AS "wumbo",
  EXTRACTJSONFIELD("payload", '$.accounts.initializeArgs.tokenBonding') AS "tokenBonding",
  EXTRACTJSONFIELD("payload", '$.accounts.initializeArgs.baseRoyalties') AS "baseRoyalties",
  EXTRACTJSONFIELD("payload", '$.accounts.initializeArgs.targetRoyalties') AS "targetRoyalties",
  EXTRACTJSONFIELD("payload", '$.accounts.initializeArgs.targetMint') AS "targetMint",
  EXTRACTJSONFIELD("payload", '$.accounts.initializeArgs.tokenMetadata') AS "tokenMetadata",
  EXTRACTJSONFIELD("payload", '$.accounts.name') AS "name",
  EXTRACTJSONFIELD("payload", '$.accounts.reverseTokenRef') AS "reverseTokenRef",
  EXTRACTJSONFIELD("payload", '$.accounts.tokenRef') AS "tokenRef"
FROM spl_wumbo_events
WHERE "type" = 'initializeUnclaimedSocialTokenV0'
EMIT CHANGES;

CREATE OR REPLACE STREAM wumbo_create_owned_tokens
WITH (kafka_topic='json.solana.wumbo_create_owned_tokens', value_format='json', partitions=1) 
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
  EXTRACTJSONFIELD("payload", '$.accounts.initializeArgs.wumbo') AS "wumbo",
  EXTRACTJSONFIELD("payload", '$.accounts.initializeArgs.tokenBonding') AS "tokenBonding",
  EXTRACTJSONFIELD("payload", '$.accounts.initializeArgs.baseRoyalties') AS "baseRoyalties",
  EXTRACTJSONFIELD("payload", '$.accounts.initializeArgs.targetRoyalties') AS "targetRoyalties",
  EXTRACTJSONFIELD("payload", '$.accounts.initializeArgs.targetMint') AS "targetMint",
  EXTRACTJSONFIELD("payload", '$.accounts.initializeArgs.tokenMetadata') AS "tokenMetadata",
  EXTRACTJSONFIELD("payload", '$.accounts.owner') AS "owner",
  EXTRACTJSONFIELD("payload", '$.accounts.reverseTokenRef') AS "reverseTokenRef",
  EXTRACTJSONFIELD("payload", '$.accounts.tokenRef') AS "tokenRef"
FROM spl_wumbo_events
WHERE "type" = 'initializeOwnedSocialTokenV0'
EMIT CHANGES;

CREATE OR REPLACE STREAM wumbo_token_claims
WITH (kafka_topic='json.solana.wumbo_token_claims', value_format='json', partitions=1) 
AS SELECT
  "slot" AS "slot",
  "blockhash" AS "blockhash",
  "recentBlockhash" AS "recentBlockhash",
  "blockTime" AS "blockTime",
  EXTRACTJSONFIELD("payload", '$.instructionIndex') AS "instructionIndex",
  EXTRACTJSONFIELD("payload", '$.innerIndex') AS "innerIndex",
  EXTRACTJSONFIELD("payload", '$.accounts.wumbo') AS "wumbo",
  EXTRACTJSONFIELD("payload", '$.accounts.tokenRef') AS "tokenRef",
  EXTRACTJSONFIELD("payload", '$.accounts.newTokenRef') AS "newTokenRef",
  EXTRACTJSONFIELD("payload", '$.accounts.reverseTokenRef') AS "reverseTokenRef",
  EXTRACTJSONFIELD("payload", '$.accounts.tokenBonding') AS "tokenBonding",
  EXTRACTJSONFIELD("payload", '$.accounts.tokenBondingAuthority') AS "tokenBondingAuthority",
  EXTRACTJSONFIELD("payload", '$.accounts.targetRoyaltiesOwner') AS "targetRoyaltiesOwner",
  EXTRACTJSONFIELD("payload", '$.accounts.newTargetRoyalties') AS "newTargetRoyalties",
  EXTRACTJSONFIELD("payload", '$.accounts.targetRoyalties') AS "targetRoyalties",
  EXTRACTJSONFIELD("payload", '$.accounts.name') AS "name",
  EXTRACTJSONFIELD("payload", '$.accounts.owner') AS "owner"
FROM spl_wumbo_events
WHERE "type" = 'claimSocialTokenV0'
EMIT CHANGES;

CREATE STREAM wumbo_users(
  "owner" VARCHAR,
  "tokenRef" VARCHAR,
  "reverseTokenRef" VARCHAR,
  "tokenBonding" VARCHAR,
  "blockTime" BIGINT
)
  WITH(kafka_topic='json.solana.wumbo_users', partitions=1, value_format='json');

INSERT INTO wumbo_users SELECT
  "owner",
  "tokenRef",
  "reverseTokenRef",
  "tokenBonding",
  "blockTime"
FROM wumbo_token_claims
EMIT CHANGES;

INSERT INTO wumbo_users SELECT
  "owner",
  "tokenRef",
  "reverseTokenRef",
  "tokenBonding",
  "blockTime"
FROM wumbo_create_owned_tokens
EMIT CHANGES;

CREATE TABLE wumbo_users_table
  WITH(kafka_topic='json.solana.wumbo_users_table', partitions=1, value_format='json')
AS SELECT
  "owner",
  LATEST_BY_OFFSET("tokenRef") as "tokenRef",
  LATEST_BY_OFFSET("reverseTokenRef") as "reverseTokenRef",
  LATEST_BY_OFFSET("tokenBonding") as "tokenBonding",
  LATEST_BY_OFFSET("blockTime") as "blockTime"
FROM wumbo_users
GROUP BY "owner"
EMIT CHANGES;

CREATE OR REPLACE TABLE token_bonding_initializes
WITH (kafka_topic='json.solana.token_bonding_initializes', value_format='json', partitions=1) 
AS SELECT
  LATEST_BY_OFFSET("slot") AS "slot",
  LATEST_BY_OFFSET("blockhash") AS "blockhash",
  LATEST_BY_OFFSET("recentBlockhash") AS "recentBlockhash",
  LATEST_BY_OFFSET("blockTime") AS "blockTime",
  LATEST_BY_OFFSET(EXTRACTJSONFIELD("payload", '$.instructionIndex')) AS "instructionIndex",
  LATEST_BY_OFFSET(EXTRACTJSONFIELD("payload", '$.innerIndex')) AS "innerIndex",
  LATEST_BY_OFFSET(EXTRACTJSONFIELD("payload", '$.data.args.baseRoyaltyPercentage')) AS "baseRoyaltyPercentage",
  LATEST_BY_OFFSET(EXTRACTJSONFIELD("payload", '$.data.args.targetRoyaltyPercentage')) AS "targetRoyaltyPercentage",
  LATEST_BY_OFFSET(EXTRACTJSONFIELD("payload", '$.data.args.mintCap')) AS "mintCap",
  LATEST_BY_OFFSET(EXTRACTJSONFIELD("payload", '$.data.args.tokenBondingAuthority')) AS "tokenBondingAuthority",
  LATEST_BY_OFFSET(EXTRACTJSONFIELD("payload", '$.data.args.buyFrozen')) AS "buyFrozen",
  LATEST_BY_OFFSET(EXTRACTJSONFIELD("payload", '$.accounts.payer')) AS "payer",
  LATEST_BY_OFFSET(EXTRACTJSONFIELD("payload", '$.accounts.tokenBonding')) AS "tokenBonding",
  LATEST_BY_OFFSET(EXTRACTJSONFIELD("payload", '$.accounts.curve')) AS "curve",
  LATEST_BY_OFFSET(EXTRACTJSONFIELD("payload", '$.accounts.baseMint')) AS "baseMint",
  EXTRACTJSONFIELD("payload", '$.accounts.targetMint') AS "targetMint",
  LATEST_BY_OFFSET(EXTRACTJSONFIELD("payload", '$.accounts.baseRoyalties')) AS "baseRoyalties",
  LATEST_BY_OFFSET(EXTRACTJSONFIELD("payload", '$.accounts.targetRoyalties')) AS "targetRoyalties",
  LATEST_BY_OFFSET(EXTRACTJSONFIELD("payload", '$.accounts.baseStorage')) AS "baseStorage",
  LATEST_BY_OFFSET(EXTRACTJSONFIELD("payload", '$.accounts.baseStorageAuthority')) AS "baseStorageAuthority"
FROM spl_token_bonding_events
WHERE "type" = 'initializeTokenBondingV0'
GROUP BY EXTRACTJSONFIELD("payload", '$.accounts.targetMint')
EMIT CHANGES;

CREATE OR REPLACE STREAM bonding_token_account_balance_changes 
WITH (kafka_topic='json.solana.bonding_token_account_balance_changes', value_format='json', partitions=1) 
AS SELECT
  solana_events."type" as "type", 
  solana_events."slot" as "slot", 
  solana_events."blockhash" as "blockhash",
  solana_events."blockTime" as "blockTime",
  solana_events."recentBlockhash" as "recentBlockhash",
  EXTRACTJSONFIELD("payload", '$.instructionIndex') AS "instructionIndex",
  EXTRACTJSONFIELD("payload", '$.innerIndex') AS "innerIndex",
  EXTRACTJSONFIELD("payload", '$.pubkey') AS "pubkey",
  token_bonding_initializes."targetMint" AS "mint",
  EXTRACTJSONFIELD("payload", '$.preAmount') AS "preAmount",
  EXTRACTJSONFIELD("payload", '$.postAmount') AS "postAmount",
  CAST(EXTRACTJSONFIELD("payload", '$.decimals') AS INTEGER) AS "decimals"
FROM solana_events
JOIN token_bonding_initializes ON token_bonding_initializes."targetMint" = EXTRACTJSONFIELD("payload", '$.mint')
WHERE "type" = 'TokenAccountBalanceChange'
EMIT CHANGES;

CREATE OR REPLACE STREAM token_bonding_supply_changes
WITH (kafka_topic='json.solana.token_bonding_supply_changes', value_format='json', partitions=1) 
AS SELECT
  "type", 
  "slot", 
  "blockhash",
  "recentBlockhash",
  "blockTime",
  EXTRACTJSONFIELD("payload", '$.instructionIndex') AS "instructionIndex",
  EXTRACTJSONFIELD("payload", '$.innerIndex') AS "innerIndex",
  EXTRACTJSONFIELD("payload", '$.accounts.tokenBonding') AS "tokenBonding",
  EXTRACTJSONFIELD("payload", '$.accounts.curve') AS "curve",
  EXTRACTJSONFIELD("payload", '$.accounts.baseMint') AS "baseMint",
  EXTRACTJSONFIELD("payload", '$.accounts.targetMint') AS "targetMint",
  CASE WHEN "type" = 'buyV0' THEN 
    CAST(
      CONCAT(
        SUBSTRING(LPAD(EXTRACTJSONFIELD("payload", '$.data.args.targetAmount'), 27, '0'), 1, 27 - 9), 
        '.', 
        SUBSTRING(LPAD(EXTRACTJSONFIELD("payload", '$.data.args.targetAmount'), 27, '0'), 27 - 9 + 1, 9)
      )
      AS DECIMAL(27, 9)
    ) 
  ELSE
    - CAST(
      CONCAT(
        SUBSTRING(LPAD(EXTRACTJSONFIELD("payload", '$.data.args.targetAmount'), 27, '0'), 1, 27 - 9), 
        '.', 
        SUBSTRING(LPAD(EXTRACTJSONFIELD("payload", '$.data.args.targetAmount'), 27, '0'), 27 - 9 + 1, 9)
      )
      AS DECIMAL(27, 9)
    ) 
  END AS "amount"
FROM spl_token_bonding_events WHERE "type" = 'buyV0' or "type" = 'sellV0'
EMIT CHANGES;

CREATE TABLE token_bonding_supply 
WITH (kafka_topic='json.solana.token_bonding_supply', partitions=1, value_format='json')
AS SELECT
  "targetMint",
  LATEST_BY_OFFSET("curve") AS "curve",
  LATEST_BY_OFFSET("baseMint") AS "baseMint",
  LATEST_BY_OFFSET("tokenBonding") AS "tokenBonding", 
  LATEST_BY_OFFSET("blockTime") AS "blockTime",
  LATEST_BY_OFFSET("instructionIndex") AS "instructionIndex",
  LATEST_BY_OFFSET("innerIndex") AS "innerIndex",
  SUM("amount") as "supply"
FROM token_bonding_supply_changes
GROUP BY "targetMint"
EMIT CHANGES;

CREATE OR REPLACE TABLE log_curves 
WITH (kafka_topic='json.solana.log_curves', value_format='json', partitions=1) 
AS SELECT
  LATEST_BY_OFFSET("slot") AS "slot",
  LATEST_BY_OFFSET("blockhash") AS "blockhash",
  LATEST_BY_OFFSET("recentBlockhash") AS "recentBlockhash",
  LATEST_BY_OFFSET("blockTime") AS "blockTime",
  LATEST_BY_OFFSET(EXTRACTJSONFIELD("payload", '$.instructionIndex')) AS "instructionIndex",
  LATEST_BY_OFFSET(EXTRACTJSONFIELD("payload", '$.innerIndex')) AS "innerIndex",
  EXTRACTJSONFIELD("payload", '$.accounts.curve') AS "curve",
  CAST(LATEST_BY_OFFSET(EXTRACTJSONFIELD("payload", '$.data.args.logCurveV0.taylorIterations')) AS INT) AS "taylorIterations",
  CAST(
    CONCAT(
      SUBSTRING(LATEST_BY_OFFSET(LPAD(EXTRACTJSONFIELD("payload", '$.data.args.logCurveV0.g'), 46, '0')), 1, 46 - 12), 
      '.', 
      SUBSTRING(LATEST_BY_OFFSET(LPAD(EXTRACTJSONFIELD("payload", '$.data.args.logCurveV0.g'), 46, '0')), 46 - 12 + 1, 12)
    ) AS DECIMAL(46, 12)
  ) AS "g",
  CAST(
    CONCAT(
      SUBSTRING(LATEST_BY_OFFSET(LPAD(EXTRACTJSONFIELD("payload", '$.data.args.logCurveV0.c'), 46, '0')), 1, 46 - 12),
      '.',
      SUBSTRING(LATEST_BY_OFFSET(LPAD(EXTRACTJSONFIELD("payload", '$.data.args.logCurveV0.c'), 46, '0')), 46 - 12 + 1, 12)
    ) AS DECIMAL(46, 12)
  ) AS "c"
FROM spl_token_bonding_events
WHERE "type" = 'createCurveV0' AND EXTRACTJSONFIELD("payload", '$.data.args.logCurveV0') IS NOT NULL
GROUP BY EXTRACTJSONFIELD("payload", '$.accounts.curve')
EMIT CHANGES;

CREATE OR REPLACE STREAM accounts 
WITH (kafka_topic='json.solana.accounts', value_format='json', partitions=1) 
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
WHERE "type" = 'InitializeAssociatedTokenAccount'
EMIT CHANGES;

CREATE OR REPLACE TABLE accounts_table
WITH (kafka_topic='json.solana.accounts_table', value_format='json', partitions=1)
AS SELECT
  LATEST_BY_OFFSET("slot") as "slot",
  LATEST_BY_OFFSET("blockhash") as "blockhash",
  LATEST_BY_OFFSET("recentBlockhash") as "recentBlockhash",
  LATEST_BY_OFFSET("blockTime") as "blockTIme",
  LATEST_BY_OFFSET("instructionIndex") as "instructionIndex",
  LATEST_BY_OFFSET("innerIndex") as "innerIndex",
  "account",
  LATEST_BY_OFFSET("mint") as "mint",
  LATEST_BY_OFFSET("owner") as "owner"
FROM accounts
GROUP BY "account"
EMIT CHANGES;

CREATE TABLE token_bonding_prices
WITH (kafka_topic='json.solana.token_bonding_prices', value_format='json', partitions=1) 
AS SELECT
  "targetMint",
  token_bonding_supply."curve" AS "curve",
  token_bonding_supply."baseMint" AS "baseMint",
  token_bonding_supply."tokenBonding" AS "tokenBonding",
  token_bonding_supply."blockTime" AS "blockTime",
  token_bonding_supply."instructionIndex" AS "instructionIndex",
  token_bonding_supply."innerIndex" AS "innerIndex",
  CAST("c" * LN(1 + ("g" * "supply")) AS DECIMAL(46, 12)) AS "price"
FROM token_bonding_supply
INNER JOIN log_curves ON token_bonding_supply."curve" = log_curves."curve"
EMIT CHANGES;

CREATE OR REPLACE STREAM wum_locked_by_account ("account" VARCHAR KEY, "owner" VARCHAR, "tokenAmount" DECIMAL(27, 9), "wumLocked" DECIMAL(27, 9), "mint" VARCHAR, "blockTime" BIGINT)
    WITH (kafka_topic='json.solana.wum_locked_by_account', partitions=1, value_format='json');

INSERT INTO wum_locked_by_account
SELECT
  bonding_token_account_balance_changes."pubkey" as "account",
  accounts_table."owner" as "owner",
  CAST(
    CONCAT(
      SUBSTRING(LPAD("postAmount", 27, '0'), 1, 27 - "decimals"), 
      '.', 
      SUBSTRING(LPAD("postAmount", 27, '0'), 27 - "decimals" + 1, "decimals")
    ) AS DECIMAL(27, 9)
  ) AS "tokenAmount",
  CASE WHEN "price" IS NULL THEN
    NULL
  ELSE
    (
      CAST(
        CAST(
          CONCAT(
            SUBSTRING(LPAD("postAmount", 27, '0'), 1, 27 - "decimals"), 
            '.', 
            SUBSTRING(LPAD("postAmount", 27, '0'), 27 - "decimals" + 1, "decimals")
          ) AS DECIMAL(27, 9)
        ) * "price" AS DECIMAL(27, 9)
      )
    )
  END AS "wumLocked",
  bonding_token_account_balance_changes."mint" as "mint",
  bonding_token_account_balance_changes."blockTime" as "blockTime"
FROM bonding_token_account_balance_changes
LEFT OUTER JOIN token_bonding_prices ON token_bonding_prices."targetMint" = bonding_token_account_balance_changes."mint"
LEFT OUTER JOIN accounts_table ON accounts_table."account" = bonding_token_account_balance_changes."pubkey"
WHERE "baseMint" IS NULL OR "baseMint" = 'FghXoMJ1N7QSF5wTQpZK1bpn46T3cM4yoJeQq7mJpTcM'
EMIT CHANGES;

INSERT INTO wum_locked_by_account
SELECT
  bonding_token_account_balance_changes."pubkey" as "account",
  accounts_table."owner" as "owner",
  CAST(
    CONCAT(
      SUBSTRING(LPAD("postAmount", 27, '0'), 1, 27 - "decimals"), 
      '.', 
      SUBSTRING(LPAD("postAmount", 27, '0'), 27 - "decimals" + 1, "decimals")
    ) AS DECIMAL(27, 9)
  ) AS "tokenAmount",
  CAST(
    CONCAT(
      SUBSTRING(LPAD("postAmount", 27, '0'), 1, 27 - "decimals"), 
      '.', 
      SUBSTRING(LPAD("postAmount", 27, '0'), 27 - "decimals" + 1, "decimals")
    ) AS DECIMAL(27, 9)
  ) AS "wumLocked",
  bonding_token_account_balance_changes."mint" as "mint",
  bonding_token_account_balance_changes."blockTime" as "blockTime"
FROM bonding_token_account_balance_changes
LEFT OUTER JOIN accounts_table ON accounts_table."account" = bonding_token_account_balance_changes."pubkey"
WHERE bonding_token_account_balance_changes."mint" = 'FghXoMJ1N7QSF5wTQpZK1bpn46T3cM4yoJeQq7mJpTcM'
EMIT CHANGES;

INSERT INTO wum_locked_by_account
SELECT
  wum_locked_by_account."account" as "account",
  accounts."owner" as "owner",
  wum_locked_by_account."tokenAmount" as "tokenAmount",
  "wumLocked",
  wum_locked_by_account."mint" as "mint",
  wum_locked_by_account."blockTime" as "blockTime"
FROM accounts
JOIN wum_locked_by_account WITHIN 2 HOURS ON accounts."account" = wum_locked_by_account."account" 
WHERE wum_locked_by_account."owner" IS NULL
EMIT CHANGES;

-- Because prices can come out of order, append the price if it comes in later:
CREATE OR REPLACE STREAM token_bonding_prices_stream(
  "targetMint" VARCHAR KEY,
  "curve" VARCHAR,
  "baseMint" VARCHAR,
  "tokenBonding" VARCHAR,
  "blockTime" BIGINT,
  "price" DECIMAL(46, 12)
)
  WITH(kafka_topic='json.solana.token_bonding_prices', partitions=1, value_format='json');

INSERT INTO wum_locked_by_account
SELECT
  wum_locked_by_account."account" as "account",
  wum_locked_by_account."owner" as "owner",
  wum_locked_by_account."tokenAmount" as "tokenAmount",
  CAST(
    wum_locked_by_account."tokenAmount" * token_bonding_prices_stream."price" AS DECIMAL(27, 9)
  ) AS "wumLocked",
  wum_locked_by_account."mint" as "mint",
  wum_locked_by_account."blockTime" as "blockTime"
FROM wum_locked_by_account
JOIN token_bonding_prices_stream WITHIN 2 HOURS ON wum_locked_by_account."mint" = token_bonding_prices_stream."targetMint" 
WHERE wum_locked_by_account."wumLocked" IS NULL
PARTITION BY "account"
EMIT CHANGES;

CREATE STREAM wumbo_users_wum_locked_by_account
    WITH (kafka_topic='json.solana.wumbo_users_wum_locked_by_account', partitions=1, value_format='json')
AS
SELECT
  "account",
  wumbo_users_table."owner" as "owner",
  "tokenAmount",
  "wumLocked",
  "mint",
  wum_locked_by_account."blockTime" as "blockTime"
FROM wum_locked_by_account
JOIN wumbo_users_table ON wumbo_users_table."owner" = wum_locked_by_account."owner";

CREATE TABLE wum_locked_by_account_table
    WITH (kafka_topic='json.solana.wum_locked_by_account_table', partitions=1, value_format='json')
AS
SELECT 
  "account",
  LATEST_BY_OFFSET("owner") AS "owner",
  CAST(LATEST_BY_OFFSET(CAST("wumLocked" AS VARCHAR)) AS DECIMAL(27, 9)) as "wumLocked"
FROM wum_locked_by_account
WHERE "owner" IS NOT NULL AND "wumLocked" IS NOT NULL
GROUP BY "account"
EMIT CHANGES;

CREATE OR REPLACE TABLE total_wum_locked
WITH (kafka_topic='json.solana.total_wum_locked', value_format='json', partitions=1)
AS
  SELECT 
    "owner",
    SUM("wumLocked") AS "wumLocked"
  FROM wum_locked_by_account_table
  GROUP BY "owner"
  EMIT CHANGES;

-- WUM locked for only claimed users
CREATE OR REPLACE TABLE wumbo_users_total_wum_locked
WITH (kafka_topic='json.solana.wumbo_users_total_wum_locked', value_format='json', partitions=1)
AS
  SELECT 
    wumbo_users_table."owner",
    total_wum_locked."wumLocked"
  FROM total_wum_locked
  JOIN wumbo_users_table ON wumbo_users_table."owner" = total_wum_locked."owner"
  EMIT CHANGES;
