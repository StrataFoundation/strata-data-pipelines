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
  solana_events."blockTime" as "blockTime",
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
  CAST("c" * LN(1 + ("g" * "supply")) AS DECIMAL(46, 12)) AS "price"
FROM token_bonding_supply
INNER JOIN curves ON token_bonding_supply."curve" = curves."curve"
EMIT CHANGES;

CREATE OR REPLACE STREAM wum_locked_by_account ("account" VARCHAR KEY, "owner" VARCHAR, "tokenAmount" DECIMAL(27, 9), "wumLocked" DECIMAL(27, 9), "mint" VARCHAR, "blockTime" BIGINT)
    WITH (kafka_topic='json.solana.wum_locked_by_account', partitions=1, value_format='json');

INSERT INTO wum_locked_by_account
SELECT
  bonding_token_account_balance_changes."pubkey" as "account",
  accounts."owner" as "owner",
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
LEFT OUTER JOIN accounts ON accounts."account" = bonding_token_account_balance_changes."pubkey"
WHERE "baseMint" IS NULL OR "baseMint" = 'EN75YBRFCoSezbkvRfbEqvsRU4mgXaDQjG7fkAtYjN9z';

INSERT INTO wum_locked_by_account
SELECT
  bonding_token_account_balance_changes."pubkey" as "account",
  accounts."owner" as "owner",
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
LEFT OUTER JOIN accounts ON accounts."account" = bonding_token_account_balance_changes."pubkey"
WHERE bonding_token_account_balance_changes."mint" = 'EN75YBRFCoSezbkvRfbEqvsRU4mgXaDQjG7fkAtYjN9z';

-- Because accounts can come out of order, append the account if it comes in later:
CREATE STREAM accounts_stream(
  "account" VARCHAR KEY,
  "slot" BIGINT,
  "blockhash" VARCHAR,
  "recentBlockhash" VARCHAR,
  "blockTime" BIGINT,
  "instructionIndex" INT,
  "mint" VARCHAR,
  "owner" VARCHAR
)
  WITH(kafka_topic='json.solana.accounts', partitions=1, value_format='json');

INSERT INTO wum_locked_by_account
SELECT
  wum_locked_by_account."account" as "account",
  accounts_stream."owner" as "owner",
  wum_locked_by_account."tokenAmount" as "tokenAmount",
  "wumLocked",
  wum_locked_by_account."mint" as "mint",
  wum_locked_by_account."blockTime" as "blockTime"
FROM accounts_stream
JOIN wum_locked_by_account WITHIN 2 HOURS ON accounts_stream."account" = wum_locked_by_account."account" 
WHERE wum_locked_by_account."owner" IS NULL;


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
PARTITION BY "account";

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
