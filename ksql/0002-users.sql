CREATE STREAM collective_users(
  "owner" VARCHAR,
  "tokenRef" VARCHAR,
  "reverseTokenRef" VARCHAR,
  "tokenBonding" VARCHAR,
  "blockTime" BIGINT,
  "collective" VARCHAR
)
  WITH(kafka_topic='json.solana.collective_users', partitions=1, value_format='json');

INSERT INTO collective_users SELECT
  "owner",
  "tokenRef",
  "reverseTokenRef",
  "tokenBonding",
  "blockTime",
  "collective"
FROM collective_token_claims
EMIT CHANGES;

INSERT INTO collective_users SELECT
  "owner",
  "tokenRef",
  "reverseTokenRef",
  "tokenBonding",
  "blockTime",
  "collective"
FROM collective_create_owned_tokens
EMIT CHANGES;

CREATE TABLE collective_users_table
  WITH(kafka_topic='json.solana.collective_users_table', partitions=1, value_format='json')
AS SELECT
  "owner",
  LATEST_BY_OFFSET("tokenRef") as "tokenRef",
  LATEST_BY_OFFSET("reverseTokenRef") as "reverseTokenRef",
  LATEST_BY_OFFSET("tokenBonding") as "tokenBonding",
  LATEST_BY_OFFSET("blockTime") as "blockTime",
  LATEST_BY_OFFSET("collective") as "collective"
FROM collective_users
GROUP BY "owner"
EMIT CHANGES;
