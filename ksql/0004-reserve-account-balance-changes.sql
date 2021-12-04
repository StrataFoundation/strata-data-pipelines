CREATE OR REPLACE TABLE token_bonding_base_storage
WITH (kafka_topic='json.solana.token_bonding_base_storage', value_format='json', partitions=1)
AS
SELECT LATEST_BY_OFFSET("tokenBonding") as "tokenBonding", "baseStorage"
FROM token_bonding_initializes
GROUP BY "baseStorage";


CREATE OR REPLACE STREAM reserve_token_account_balance_changes 
WITH (kafka_topic='json.solana.reserve_token_account_balance_changes', value_format='json', partitions=1) 
AS SELECT
  token_account_balance_changes."type" as "type", 
  token_account_balance_changes."slot" as "slot", 
  token_account_balance_changes."blockhash" as "blockhash",
  token_account_balance_changes."blockTime" as "blockTime",
  token_account_balance_changes."recentBlockhash" as "recentBlockhash",
  token_account_balance_changes."instructionIndex" as "instructionIndex",
  token_account_balance_changes."innerIndex" as "innerIndex",
  token_account_balance_changes."pubkey" as "pubkey",
  token_account_balance_changes."mint" as "mint",
  token_account_balance_changes."preAmount" as "preAmount",
  token_account_balance_changes."postAmount" as "postAmount",
  token_account_balance_changes."decimals",
  token_bonding_base_storage."tokenBonding"
FROM token_account_balance_changes
JOIN token_bonding_base_storage ON token_bonding_base_storage."baseStorage" = token_account_balance_changes."pubkey"
EMIT CHANGES;

CREATE STREAM latest_reserve_token_account_balances(
  "pubkey" VARCHAR KEY,
  "type" VARCHAR, 
  "slot" BIGINT, 
  "blockhash" VARCHAR,
  "blockTime" BIGINT,
  "recentBlockhash" VARCHAR,
  "instructionIndex" INTEGER,
  "innerIndex" INTEGER,
  "mint" VARCHAR,
  "tokenAmount" DECIMAL(27, 9),
  "decimals" INTEGER,
  "tokenBonding" VARCHAR
)
  WITH(kafka_topic='json.solana.latest_reserve_token_account_balances', partitions=1, value_format='json');

CREATE OR REPLACE TABLE reserve_token_account_balance_changes_high_watermark
WITH (kafka_topic='json.solana.reserve_token_account_balance_changes_high_watermark', value_format='json', partitions=1)
AS SELECT "pubkey", MAX("blockTime") as "maxBlockTime"
FROM latest_reserve_token_account_balances
GROUP BY "pubkey" 
EMIT CHANGES;

INSERT INTO latest_reserve_token_account_balances
SELECT
  reserve_token_account_balance_changes."type" as "type", 
  reserve_token_account_balance_changes."slot" as "slot", 
  reserve_token_account_balance_changes."blockhash" as "blockhash",
  reserve_token_account_balance_changes."blockTime" as "blockTime",
  reserve_token_account_balance_changes."recentBlockhash" as "recentBlockhash",
  CAST(reserve_token_account_balance_changes."instructionIndex" as INT) as "instructionIndex",
  CAST(reserve_token_account_balance_changes."innerIndex" as INT) as "innerIndex",
  reserve_token_account_balance_changes."pubkey" as "pubkey",
  reserve_token_account_balance_changes."mint" as "mint",
  CAST(
    CONCAT(
      SUBSTRING(LPAD("postAmount", 27, '0'), 1, 27 - "decimals"), 
      '.', 
      SUBSTRING(LPAD("postAmount", 27, '0'), 27 - "decimals" + 1, "decimals")
    ) AS DECIMAL(27, 9)
  ) AS "tokenAmount",
  reserve_token_account_balance_changes."decimals",
  reserve_token_account_balance_changes."tokenBonding" as "tokenBonding"
FROM reserve_token_account_balance_changes
LEFT OUTER JOIN reserve_token_account_balance_changes_high_watermark ON reserve_token_account_balance_changes_high_watermark."pubkey" = reserve_token_account_balance_changes."pubkey"
WHERE "blockTime" >= "maxBlockTime" OR "maxBlockTime" IS NULL
EMIT CHANGES;
