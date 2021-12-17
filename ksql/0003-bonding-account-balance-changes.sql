CREATE OR REPLACE TABLE token_bonding_target_mint
WITH (kafka_topic='json.solana.token_bonding_target_mint', value_format='json', partitions=1, replicas=1)
AS
SELECT LATEST_BY_OFFSET("tokenBonding") as "tokenBonding", "targetMint"
FROM token_bonding_initializes
GROUP BY "targetMint";


CREATE OR REPLACE STREAM bonding_token_account_balance_changes 
WITH (kafka_topic='json.solana.bonding_token_account_balance_changes', value_format='json', partitions=1, replicas=1) 
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
  token_account_balance_changes."decimals" as "decimals",
  token_bonding_target_mint."tokenBonding" as "tokenBonding"
FROM token_account_balance_changes
JOIN token_bonding_target_mint ON token_bonding_target_mint."targetMint" = token_account_balance_changes."mint"
EMIT CHANGES;

CREATE STREAM latest_bonding_token_account_balances(
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
  "tokenBonding" VARCHAR,
  "decimals" INTEGER
)
  WITH(kafka_topic='json.solana.latest_bonding_token_account_balances', partitions=1, replicas=1, value_format='json');

CREATE OR REPLACE TABLE bonding_token_account_balance_changes_high_watermark
WITH (kafka_topic='json.solana.bonding_token_account_balance_changes_high_watermark', value_format='json', partitions=1, replicas=1)
AS SELECT "pubkey", MAX("blockTime") as "maxBlockTime"
FROM latest_bonding_token_account_balances
GROUP BY "pubkey" 
EMIT CHANGES;

INSERT INTO latest_bonding_token_account_balances
SELECT
  bonding_token_account_balance_changes."type" as "type", 
  bonding_token_account_balance_changes."slot" as "slot", 
  bonding_token_account_balance_changes."blockhash" as "blockhash",
  bonding_token_account_balance_changes."blockTime" as "blockTime",
  bonding_token_account_balance_changes."recentBlockhash" as "recentBlockhash",
  CAST(bonding_token_account_balance_changes."instructionIndex" as INT) as "instructionIndex",
  CAST(bonding_token_account_balance_changes."innerIndex" as INT) as "innerIndex",
  bonding_token_account_balance_changes."pubkey" as "pubkey",
  bonding_token_account_balance_changes."mint" as "mint",
  CAST(
    CONCAT(
      SUBSTRING(LPAD("postAmount", 27, '0'), 1, 27 - "decimals"), 
      '.', 
      SUBSTRING(LPAD("postAmount", 27, '0'), 27 - "decimals" + 1, "decimals")
    ) AS DECIMAL(27, 9)
  ) AS "tokenAmount",
  bonding_token_account_balance_changes."tokenBonding" as "tokenBonding",
  bonding_token_account_balance_changes."decimals"
FROM bonding_token_account_balance_changes
LEFT OUTER JOIN bonding_token_account_balance_changes_high_watermark ON bonding_token_account_balance_changes_high_watermark."pubkey" = bonding_token_account_balance_changes."pubkey"
WHERE "blockTime" >= "maxBlockTime" OR "maxBlockTime" IS NULL
EMIT CHANGES;
