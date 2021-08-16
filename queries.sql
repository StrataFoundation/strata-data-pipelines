CREATE STREAM solana_events ("type" VARCHAR, "slot" BIGINT, "blockTime" BIGINT, "blockhash" VARCHAR, "recentBlockhash" VARCHAR, "payload" VARCHAR)
WITH (kafka_topic='json.solana.events', value_format='json', partitions=1);

CREATE OR REPLACE TABLE token_bonding_initializes
WITH (kafka_topic='json.solana.token_bonding_initializes', value_format='json', partitions=1) 
AS SELECT
  LATEST_BY_OFFSET("slot") AS "slot",
  LATEST_BY_OFFSET("blockhash") AS "blockhash",
  LATEST_BY_OFFSET("recentBlockhash") AS "recentBlockhash",
  LATEST_BY_OFFSET("blockTime") AS "blockTime",
  LATEST_BY_OFFSET(EXTRACTJSONFIELD("payload", '$.instructionIndex')) AS "instructionIndex",
  LATEST_BY_OFFSET(EXTRACTJSONFIELD("payload", '$.payer')) AS "payer",
  LATEST_BY_OFFSET(EXTRACTJSONFIELD("payload", '$.tokenBonding')) AS "tokenBonding",
  LATEST_BY_OFFSET(EXTRACTJSONFIELD("payload", '$.curve')) AS "curve",
  LATEST_BY_OFFSET(EXTRACTJSONFIELD("payload", '$.baseMint')) AS "baseMint",
  EXTRACTJSONFIELD("payload", '$.targetMint') AS "targetMint",
  LATEST_BY_OFFSET(EXTRACTJSONFIELD("payload", '$.founderRewards')) AS "founderRewards",
  LATEST_BY_OFFSET(EXTRACTJSONFIELD("payload", '$.baseStorage')) AS "baseStorage",
  LATEST_BY_OFFSET(EXTRACTJSONFIELD("payload", '$.baseStorageAuthority')) AS "baseStorageAuthority"
FROM solana_events
WHERE "type" = 'InitializeTokenBondingV0'
GROUP BY EXTRACTJSONFIELD("payload", '$.targetMint');

CREATE OR REPLACE STREAM bonding_token_account_balance_changes 
WITH (kafka_topic='json.solana.bonding_token_account_balance_changes', value_format='json', partitions=1) 
AS SELECT
  solana_events."type" as "type", 
  solana_events."slot" as "slot", 
  solana_events."blockhash" as "blockhash",
  solana_events."blockTime" as "blocktime",
  solana_events."recentBlockhash" as "recentBlockhash",
  EXTRACTJSONFIELD("payload", '$.instructionIndex') AS "instructionIndex",
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
  EXTRACTJSONFIELD("payload", '$.tokenBonding') AS "tokenBonding",
  EXTRACTJSONFIELD("payload", '$.curve') AS "curve",
  EXTRACTJSONFIELD("payload", '$.baseMint') AS "baseMint",
  EXTRACTJSONFIELD("payload", '$.targetMint') AS "targetMint",
  CASE WHEN "type" = 'BuyTokenBondingV0' THEN 
    CAST(
      CONCAT(
        SUBSTRING(LPAD(EXTRACTJSONFIELD("payload", '$.amount'), 27, '0'), 1, 27 - 9), 
        '.', 
        SUBSTRING(LPAD(EXTRACTJSONFIELD("payload", '$.amount'), 27, '0'), 27 - 9 + 1, 9)
      )
      AS DECIMAL(27, 9)
    ) 
  ELSE
    - CAST(
      CONCAT(
        SUBSTRING(LPAD(EXTRACTJSONFIELD("payload", '$.amount'), 27, '0'), 1, 27 - 9), 
        '.', 
        SUBSTRING(LPAD(EXTRACTJSONFIELD("payload", '$.amount'), 27, '0'), 27 - 9 + 1, 9)
      )
      AS DECIMAL(27, 9)
    ) 
  END AS "amount"
FROM solana_events WHERE "type" = 'BuyTokenBondingV0' or "type" = 'SellTokenBondingV0' EMIT CHANGES;

CREATE TABLE token_bonding_supply 
WITH (kafka_topic='json.solana.token_bonding_supply', partitions=1, value_format='json')
AS SELECT
  "targetMint",
  LATEST_BY_OFFSET("curve") AS "curve",
  LATEST_BY_OFFSET("baseMint") AS "baseMint",
  LATEST_BY_OFFSET("tokenBonding") AS "tokenBonding", 
  LATEST_BY_OFFSET("blockTime") AS "blockTime",
  LATEST_BY_OFFSET("instructionIndex") AS "instructionIndex",
  SUM("amount") as "supply"
FROM token_bonding_supply_changes
GROUP BY "targetMint"
EMIT CHANGES;

CREATE OR REPLACE TABLE curves 
WITH (kafka_topic='json.solana.curves', value_format='json', partitions=1) 
AS SELECT
  LATEST_BY_OFFSET("slot") AS "slot",
  LATEST_BY_OFFSET("blockhash") AS "blockhash",
  LATEST_BY_OFFSET("recentBlockhash") AS "recentBlockhash",
  LATEST_BY_OFFSET("blockTime") AS "blockTime",
  LATEST_BY_OFFSET(EXTRACTJSONFIELD("payload", '$.instructionIndex')) AS "instructionIndex",
  EXTRACTJSONFIELD("payload", '$.curve') AS "curve",
  CAST(LATEST_BY_OFFSET(EXTRACTJSONFIELD("payload", '$.taylorIterations')) AS INT) AS "taylorIterations",
  CAST(LATEST_BY_OFFSET(EXTRACTJSONFIELD("payload", '$.isBaseRelative')) AS BOOLEAN) AS "isBaseRelative",
  CAST(
    CONCAT(
      SUBSTRING(LATEST_BY_OFFSET(LPAD(EXTRACTJSONFIELD("payload", '$.g'), 46, '0')), 1, 46 - 12), 
      '.', 
      SUBSTRING(LATEST_BY_OFFSET(LPAD(EXTRACTJSONFIELD("payload", '$.g'), 46, '0')), 46 - 12 + 1, 12)
    ) AS DECIMAL(46, 12)
  ) AS "g",
  CAST(
    CONCAT(
      SUBSTRING(LATEST_BY_OFFSET(LPAD(EXTRACTJSONFIELD("payload", '$.c'), 46, '0')), 1, 46 - 12),
      '.',
      SUBSTRING(LATEST_BY_OFFSET(LPAD(EXTRACTJSONFIELD("payload", '$.c'), 46, '0')), 46 - 12 + 1, 12)
    ) AS DECIMAL(46, 12)
  ) AS "c"
FROM solana_events
WHERE "type" = 'CreateLogCurveV0'
GROUP BY EXTRACTJSONFIELD("payload", '$.curve');

CREATE OR REPLACE TABLE accounts 
WITH (kafka_topic='json.solana.accounts', value_format='json', partitions=1) 
AS SELECT
  LATEST_BY_OFFSET("slot") AS "slot",
  LATEST_BY_OFFSET("blockhash") AS "blockhash",
  LATEST_BY_OFFSET("recentBlockhash") AS "recentBlockhash",
  LATEST_BY_OFFSET("blockTime") AS "blockTime",
  LATEST_BY_OFFSET(EXTRACTJSONFIELD("payload", '$.instructionIndex')) AS "instructionIndex",
  EXTRACTJSONFIELD("payload", '$.account') AS "account",
  LATEST_BY_OFFSET(EXTRACTJSONFIELD("payload", '$.mint')) AS "mint",
  LATEST_BY_OFFSET(EXTRACTJSONFIELD("payload", '$.owner')) AS "owner"
FROM solana_events
WHERE "type" = 'InitializeAssociatedTokenAccount'
GROUP BY EXTRACTJSONFIELD("payload", '$.account');

CREATE TABLE token_bonding_prices
WITH (kafka_topic='json.solana.token_bonding_prices', value_format='json', partitions=1) 
AS SELECT
  "targetMint",
  token_bonding_supply."curve" AS "curve",
  token_bonding_supply."baseMint" AS "baseMint",
  token_bonding_supply."tokenBonding" AS "tokenBonding",
  token_bonding_supply."blockTime" AS "blockTime",
  token_bonding_supply."instructionIndex" AS "instructionIndex",
  "c" * LN(1 + ("g" * "supply")) as "price"
FROM token_bonding_supply
INNER JOIN curves ON token_bonding_supply."curve" = curves."curve"
EMIT CHANGES;

CREATE OR REPLACE STREAM wum_locked_by_account ("pubkey" VARCHAR KEY, "owner" VARCHAR, "wumLocked" DECIMAL(27, 9))
    WITH (kafka_topic='json.solana.wum_locked_by_account', partitions=1, value_format='json');

INSERT INTO wum_locked_by_account
SELECT
  bonding_token_account_balance_changes."pubkey" as "pubkey",
  accounts."owner" as "owner",
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
  ) AS "wumLocked"
FROM bonding_token_account_balance_changes
JOIN token_bonding_prices ON token_bonding_prices."targetMint" = bonding_token_account_balance_changes."mint"
JOIN accounts ON accounts."account" = bonding_token_account_balance_changes."pubkey"
WHERE "baseMint" = '1czp9ednjLjgLuqMYNdcKM9m9xEYF3PSk4nCH8ihkT9';

INSERT INTO wum_locked_by_account
SELECT
  bonding_token_account_balance_changes."pubkey",
  accounts."owner" as "owner",
  CAST(
        CONCAT(
          SUBSTRING(LPAD("postAmount", 27, '0'), 1, 27 - "decimals"), 
          '.', 
          SUBSTRING(LPAD("postAmount", 27, '0'), 27 - "decimals" + 1, "decimals")
        ) AS DECIMAL(27, 9)
      ) AS "wumLocked"
FROM bonding_token_account_balance_changes
JOIN accounts ON accounts."account" = bonding_token_account_balance_changes."pubkey"
WHERE bonding_token_account_balance_changes."mint" = '1czp9ednjLjgLuqMYNdcKM9m9xEYF3PSk4nCH8ihkT9';

CREATE TABLE wum_locked_by_account_table
    WITH (kafka_topic='json.solana.wum_locked_by_account_table', partitions=1, value_format='json')
AS
SELECT 
  "pubkey",
  LATEST_BY_OFFSET("owner") AS "owner",
  CAST(LATEST_BY_OFFSET(CAST("wumLocked" AS VARCHAR)) AS DECIMAL(27, 9)) as "wumLocked"
FROM wum_locked_by_account
GROUP BY "pubkey"
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
