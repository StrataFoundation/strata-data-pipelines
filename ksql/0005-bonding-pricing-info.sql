CREATE OR REPLACE STREAM token_bonding_sales
WITH (kafka_topic='json.solana.token_bonding_sales', value_format='json', partitions=1) 
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
  EXTRACTJSONFIELD("payload", '$.data.args.buyWithBase.baseAmount') as "baseAmount",
  CASE WHEN "type" = 'buyV0' THEN
    EXTRACTJSONFIELD("payload", '$.data.args.buyTargetAmount.targetAmount')
  ELSE
    EXTRACTJSONFIELD("payload", '$.data.args.targetAmount')
  END as "targetAmount",
FROM spl_token_bonding_events WHERE "type" = 'buyV0' or "type" = 'sellV0'
EMIT CHANGES;


-- This HAS to happen before the table create so that the compaction doesn't hide events with tombstones
CREATE STREAM raw_deduped_token_bonding_supply_changes("type" VARCHAR, "slot" BIGINT, "blockTime" BIGINT, "blockhash" VARCHAR, "recentBlockhash" VARCHAR, "tokenBonding" VARCHAR, "curve" VARCHAR, "baseMint" VARCHAR, "targetMint" VARCHAR, "amount" DECIMAL(27, 9), "count" INT)
WITH (kafka_topic='json.solana.deduped_token_bonding_supply_changes', key_format='json', value_format='json', partitions=1);


-- https://kafka-tutorials.confluent.io/finding-distinct-events/ksql.html
 SET 'cache.max.bytes.buffering' = '0';
CREATE OR REPLACE TABLE deduped_token_bonding_supply_changes
WITH (kafka_topic='json.solana.deduped_token_bonding_supply_changes', key_format='json', value_format='json', partitions=1) 
AS SELECT "type" AS k1, 
          "slot" AS k2, 
          "blockhash" AS k3, 
          "recentBlockhash" AS k4, 
          "blockTime" AS k5, 
          "instructionIndex" AS k6, 
          "innerIndex" AS k7, 
          "tokenBonding" AS k8, 
          "curve" AS k9, 
          "baseMint" AS k10, 
          "targetMint" AS k11, 
          "amount" AS k12,
          AS_VALUE("type") AS "type", 
          AS_VALUE("slot") AS "slot", 
          AS_VALUE("blockhash") AS "blockhash", 
          AS_VALUE("recentBlockhash") AS "recentBlockhash", 
          AS_VALUE("blockTime") AS "blockTime", 
          AS_VALUE("instructionIndex") AS "instructionIndex", 
          AS_VALUE("innerIndex") AS "innerIndex", 
          AS_VALUE("tokenBonding") AS "tokenBonding", 
          AS_VALUE("curve") AS "curve", 
          AS_VALUE("baseMint") AS "baseMint", 
          AS_VALUE("targetMint") AS "targetMint", 
          AS_VALUE("amount") AS "amount",
          COUNT("type") AS "count"
FROM token_bonding_supply_changes WINDOW TUMBLING (SIZE 31 DAYS, GRACE PERIOD 31 DAYS)
GROUP BY "type", "slot", "blockhash", "recentBlockhash", "blockTime", "instructionIndex", "innerIndex", "tokenBonding", "curve", "baseMint", "targetMint", "amount"
EMIT CHANGES;
