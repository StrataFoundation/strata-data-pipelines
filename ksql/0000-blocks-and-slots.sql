CREATE STREAM blocks (
  "slot" INT,
  "skipped" BOOLEAN,
  "error" VARCHAR
)
WITH (kafka_topic='json.solana.blocks', value_format='json', partitions=1);

CREATE STREAM slots (
  "key" INT KEY,
  "slot" INT
)
WITH (kafka_topic='json.solana.slots', value_format='json', partitions=8);

SET 'cache.max.bytes.buffering' = '0';
CREATE TABLE retriable_blocks
WITH (kafka_topic='json.solana.retriable_blocks', value_format='json')
AS 
SELECT "slot" as "key", COUNT("slot") as "count", AS_VALUE("slot") AS "slot"
FROM blocks 
WHERE "skipped" = true AND ("error" like '%Block not available%' OR "error" like '%cleaned up, does not exist on node%')
GROUP BY "slot"
emit changes;

CREATE STREAM raw_retriable_blocks(
  "key" INT KEY,
  "slot" INT,
  "count" INT
)
WITH (kafka_topic='json.solana.retriable_blocks', value_format='json');

CREATE STREAM missed_slots (
  "key" INT KEY,
  "slot" INT
)
WITH (kafka_topic='json.solana.missed_slots', value_format='json', partitions=1, replicas=1);
INSERT INTO missed_slots
SELECT "key", "slot"
FROM raw_retriable_blocks
WHERE "count" = 1
EMIT CHANGES;
