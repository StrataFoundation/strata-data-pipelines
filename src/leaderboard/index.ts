import { kafka } from "../setup/kafka";
import { redisClient } from "../setup/redis";
import { promisify } from "util";
import { EachBatchPayload } from "kafkajs";

const { KAFKA_GROUP_ID, KAFKA_INPUT_TOPIC } = process.env

async function totalWumNetWorthPlugin(payload: EachBatchPayload) {
  const { batch: { messages } } = payload;
  const globalTotalWumNetWorth = messages
    .map(m => JSON.parse(m.value!.toString()))
  const lastMsg = globalTotalWumNetWorth[globalTotalWumNetWorth.length - 1]
  await promisify(redisClient.set).bind(redisClient)("total-wum-net-worth", lastMsg.totalWumNetWorth);
  console.log(`Set total wum net worth to ${lastMsg.totalWumNetWorth}`);
}

async function accountPlugin(payload: EachBatchPayload) {
  const { batch: { messages } } = payload;
  const batch = redisClient.batch()
  const balanceChangeMessages = messages
    .map(m => ({ ...JSON.parse(m.value!.toString()), account: m.key }))

  // TODO: Ensure we aren't updating something updated in a more recent slot by another instance of this process.
  // This was a start, but not working
  // const slots = await promisify(redisClient.mget).bind(redisClient, "account-slots", balanceChanges.map(m => m.pubkey))()
  // const relevantMessages = balanceChanges.filter((balanceChange, index) => {
  //   return Number(slots[index]) < Number(balanceChange.slot)
  // })
  // await promisify(redisClient.mset).bind(redisClient, "account-slots", relevantMessages.flatMap(msg => [msg.pubkey, msg.slot.toString()]))()

  const balanceChangesByBonding = balanceChangeMessages
    .reduce((acc, balanceChange) => {
      if (!acc.get(balanceChange.tokenBonding)) acc.set(balanceChange.tokenBonding, [])
      acc.get(balanceChange.tokenBonding)!.push(balanceChange)
      return acc;
    }, new Map())

  Array.from(balanceChangesByBonding)
    .forEach((keyAndValue: any) => {
      const tokenBonding: string = keyAndValue[0];
      const balanceChanges: any[] = keyAndValue[1];
      const zeroes = balanceChanges.filter(change => change.tokenAmount === 0)
      const positives = balanceChanges.filter(change => change.tokenAmount !== 0)
      const scoresAndValues = positives.flatMap((balanceChange: any) => {
        return [Number(balanceChange.tokenAmount), balanceChange.account]
      })
      // @ts-ignore
      const key = `accounts-by-balance-${tokenBonding}`;
      batch.zadd(key, 'CH', ...scoresAndValues);
      batch.zrem(key, ...zeroes.map(z => z.account));
    });
  const result = await promisify(batch.exec).bind(batch)();
  const numChanged = result.reduce((a, b) => a + b, 0);
  console.log(`Upserted ${numChanged} / ${messages.length} values`);
}

async function topTokens(payload: EachBatchPayload) {
  const { batch: { messages } } = payload;
  const batch = redisClient.batch()
  const balanceChangeMessages = messages
    .map(m => JSON.parse(m.value!.toString()))

    const balanceChangesByMint = balanceChangeMessages
    .reduce((acc, balanceChange) => {
      if (!acc.get(balanceChange.mint)) acc.set(balanceChange.mint, [])
      acc.get(balanceChange.mint)!.push(balanceChange)
      return acc;
    }, new Map())

  Array.from(balanceChangesByMint)
    .forEach((keyAndValue: any) => {
      const mint: string = keyAndValue[0];
      const balanceChanges: any[] = keyAndValue[1];
      const zeroes = balanceChanges.filter(change => change.tokenAmount === 0)
      const positives = balanceChanges.filter(change => change.tokenAmount !== 0)
      const scoresAndValues = positives.flatMap((balanceChange: any) => {
        return [Number(balanceChange.tokenAmount), balanceChange.tokenBonding]
      });

      const key = `bonding-by-tvl-${mint}`;
      // @ts-ignore
      batch.zadd(key, 'CH', ...scoresAndValues);
      batch.zrem(key, ...zeroes.map(z => z.tokenBonding));
    });
  const result = await promisify(batch.exec).bind(batch)();
  const numChanged = result.reduce((a, b) => a + b, 0);
  console.log(`Upserted ${numChanged} / ${messages.length} values`);
}

const plugins = new Map([
  ["ACCOUNT", accountPlugin],
  ["TOP_TOKENS", topTokens],
])

async function run() {
  const consumer = kafka.consumer({
    groupId: KAFKA_GROUP_ID!
  });

  await consumer.connect();
  await consumer.subscribe({
    topic: KAFKA_INPUT_TOPIC!,
    fromBeginning: process.env["KAFKA_OFFSET_RESET"] === "earliest"
  });

  return new Promise((resolve, reject) => {
    consumer.run({
      eachBatch: async (args) => {
        try {
          await plugins.get(process.env["PLUGIN"] || "ACCOUNT")!(args)
        } catch(e) {
          reject(e)
          throw e;
        }
      }
    })
  })
}

run().catch(e => {
  console.error(e);
  console.error(e.stack);
  process.exit(1);
})

