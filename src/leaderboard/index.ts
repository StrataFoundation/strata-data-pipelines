import { kafka } from "../setup/kafka";
import { redisClient } from "../setup/redis";
import { promisify } from "util";
import { EachBatchPayload } from "kafkajs";

const { KAFKA_GROUP_ID, KAFKA_INPUT_TOPIC } = process.env

async function accountPlugin(payload: EachBatchPayload) {
  const { batch: { messages } } = payload;
  const batch = redisClient.batch()
  const wumLockedMessages = messages
    .map(m => ({ ...JSON.parse(m.value!.toString()), mint: m.key }))

  // TODO: Ensure we aren't updating something updated in a more recent slot by another instance of this process.
  // This was a start, but not working
  // const slots = await promisify(redisClient.mget).bind(redisClient, "account-slots", balanceChanges.map(m => m.pubkey))()
  // const relevantMessages = balanceChanges.filter((balanceChange, index) => {
  //   return Number(slots[index]) < Number(balanceChange.slot)
  // })
  // await promisify(redisClient.mset).bind(redisClient, "account-slots", relevantMessages.flatMap(msg => [msg.pubkey, msg.slot.toString()]))()

  const wumLockedByMint = wumLockedMessages
    .reduce((acc, wumLocked) => {
      if (!acc.get(wumLocked.mint)) acc.set(wumLocked.mint, [])
      acc.get(wumLocked.mint)!.push(wumLocked)
      return acc;
    }, new Map())

  Array.from(wumLockedByMint)
    .forEach((keyAndValue: any) => {
      const mint: string = keyAndValue[0];
      const balanceChanges: any[] = keyAndValue[1];
      const scoresAndValues = balanceChanges.flatMap((balanceChange: any) => {
        return [Number(balanceChange.postAmount), balanceChange.owner]
      })
      // @ts-ignore
      batch.zadd(`accounts-by-balance-${mint}`, 'CH', ...scoresAndValues)
    });
  const result = await promisify(batch.exec).bind(batch)();
  const numChanged = result.reduce((a, b) => a + b, 0);
  console.log(`Upserted ${numChanged} / ${messages.length} values`);
}


async function wumLockedPlugin(payload: EachBatchPayload) {
  const { batch: { messages } } = payload;
  const batch = redisClient.batch()
  const wumLockedChanges = messages
    .map(m => ({ ...JSON.parse(m.value!.toString()), account: m.key.toString() }))

  // TODO: Ensure we aren't updating something updated in a more recent slot by another instance of this process.
  // This was a start, but not working
  // const slots = await promisify(redisClient.mget).bind(redisClient, "wum-locked-slots", wumLockedChanges.map(m => m.account))()
  // const relevantMessages = wumLockedChanges.filter((balanceChange, index) => {
  //   return Number(slots[index]) < balanceChange.slot
  // })
  // await promisify(redisClient.mset).bind(redisClient, "wum-locked-slots", relevantMessages.flatMap(msg => [msg.account, msg.slot]))()
  const toAdd = wumLockedChanges.flatMap(({ account, wumLocked }) => [wumLocked, account])
  batch.zadd("wum-locked", 'CH', ...toAdd)

  const result = await promisify(batch.exec).bind(batch)();
  const numChanged = result.reduce((a, b) => a + b, 0);
  console.log(`Upserted ${numChanged} / ${messages.length} values`);
}

async function topTokens(payload: EachBatchPayload) {
  const { batch: { messages } } = payload;
  const batch = redisClient.batch()
  const tokenBalanceChanges = messages
    .map(m => JSON.parse(m.value!.toString()))

  const toAdd = tokenBalanceChanges.flatMap(({ tokenBonding, supply }) => [supply, tokenBonding])
  batch.zadd("top-tokens", 'CH', ...toAdd)

  const result = await promisify(batch.exec).bind(batch)();
  const numChanged = result.reduce((a, b) => a + b, 0);
  console.log(`Upserted ${numChanged} / ${messages.length} values`);
}

const plugins = new Map([
  ["ACCOUNT", accountPlugin],
  ["WUM_LOCKED", wumLockedPlugin],
  ["TOP_TOKENS", topTokens]
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

