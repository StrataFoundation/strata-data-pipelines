CREATE STREAM trophies(
  "key" VARCHAR KEY,
  "trophyShortName" VARCHAR,
  "trophyMasterEditionMeta" VARCHAR,
  "destination" VARCHAR
)
  WITH(kafka_topic='json.solana.trophies', partitions=1, value_format='json');

CREATE STREAM raw_wumbo_users("owner" VARCHAR KEY) WITH(kafka_topic='json.solana.wumbo_users_table', value_format='json');
-- ALPHA TESTERS
INSERT INTO trophies
SELECT "owner" AS "key",
        'alpha_tester' AS "trophyShortName",
        '6xEXbyeLFzKqq7mHy28vyp6xR6bRU6m72hZvrgzNJeK7' AS "trophyMasterEditionMeta", 
        AS_VALUE("owner") AS "destination"
FROM raw_wumbo_users WHERE rowtime < 1632766320000 AND "owner" NOT IN (
  '8dPK9fYnbw1nLAHvcRUmXBh9mVmoWtsBFHi72GP2CnT9',
  'HnK4B6JA82TBBFPCTE2FJJeSZBhCPrzzV9KeRDQxiBeE',
  'CvaNBgnjXx7hbLGceUAnsgN4Lb7WNusLCaLFqfczDzp4',
  'H8FeC5b7PgvgF9wn68UoZ6PzdP8xvyw9X7YkxEbL2GTc',
  'AxkpbnNGf3fJ6EqPExxLgBVbx3LAGV4m3BqisgVbEv2Y',
  '3SawFRYytB9yhGiKYLgXasxQgNFcBvG4RdC1o4ppYckY',
  'AtcCpUDMufFZRytcfBbyzQgNGpRqCJWd8X5cPReZWGSX',
  '29dx5KPPi2DLdoQ9eEaTLrhCDQaHHLJo7LaX7SzGgzyg',
  'JUskoxS2PTiaBpxfGaAPgf3cUNhdeYFGMKdL6mZKKfR',
  '5K51fPDxJho82SVUTP2e1NUFkweHD4PawJWYVACrMtYg',
  'Gzyvrg8gJfShKQwhVYFXV5utp86tTcMxSzrN7zcfebKj',
  '44kiGWWsSgdqPMvmqYgTS78Mx2BKCWzduATkfY4biU97',
  '5BwQHT3WzZJBqAHR8tDt9UWMVpkoJ3rLHpuhUYUf57r7',
  'Gf4EWrvgqeuyszbhsq2mTMooGJ6zsMB7f1CSnZZ8vvSV',
  '6JmbM2MuB18qJyZrQC7QPHdYFV2e8YecQYYEaihNJZ3T'
) EMIT CHANGES;

