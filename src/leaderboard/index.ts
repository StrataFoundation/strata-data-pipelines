import { kafka } from "../setup/kafka";
import { redisClient } from "../setup/redis";
import { promisify } from "util";

const { KAFKA_GROUP_ID, KAFKA_INPUT_TOPIC } = process.env

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
      eachBatch: async ({ batch: { messages, offsetLag } }) => {
        try {
          const batch = redisClient.batch()
          const relevantMessages = messages
            .map(m => JSON.parse(m.value!.toString()))
            .filter(m => m.type === "TokenAccountBalanceChange");
          const balanceMessagesByMint = relevantMessages
            .reduce((acc, balanceChange) => {
              if (!acc.get(balanceChange.mint)) acc.set(balanceChange.mint, [])
              acc.get(balanceChange.mint)!.push(balanceChange)
              return acc;
            }, new Map())

          Array.from(balanceMessagesByMint)
            .forEach((keyAndValue: any) => {
              const mint: string = keyAndValue[0];
              const balanceChanges: any[] = keyAndValue[1];
              const scoresAndValues = balanceChanges.flatMap((balanceChange: any) => {
                return [Number(balanceChange.postAmount), balanceChange.pubkey]
              })
              // @ts-ignore
              batch.zadd(`accounts-by-balance-${mint}`, 'CH', ...scoresAndValues)
            });
          const result = await promisify(batch.exec).bind(batch)();
          const numChanged = result.reduce((a, b) => a + b, 0);
          console.log(`Upserted ${numChanged} / ${messages.length} values`);
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

