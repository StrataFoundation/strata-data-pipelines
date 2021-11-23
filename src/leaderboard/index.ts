import { kafka } from "../setup/kafka";
import { redisClient } from "../setup/redis";
import { promisify } from "util";
import { EachBatchPayload } from "kafkajs";

const { KAFKA_GROUP_ID, KAFKA_INPUT_TOPIC } = process.env

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
      const scoresAndValues = balanceChanges.flatMap((balanceChange: any) => {
        return [Number(balanceChange.tokenAmount), balanceChange.account]
      })
      // @ts-ignore
      batch.zadd(`accounts-by-balance-${tokenBonding}`, 'CH', ...scoresAndValues)
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
      const scoresAndValues = balanceChanges.flatMap((balanceChange: any) => {
        return [Number(balanceChange.tokenAmount), balanceChange.tokenBonding]
      })
      // @ts-ignore
      batch.zadd(`bonding-by-tvl-${mint}`, 'CH', ...scoresAndValues)
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

