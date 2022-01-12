import { ConfirmedSignatureInfo, Finality } from "@solana/web3.js";
import { truthy } from "./utils/truthy";
import { kafka } from "./setup/kafka";
import { connection } from "./setup/solana";

const FINALITY: Finality = (process.env["FINALITY"] || 'finalized') as Finality;
const { KAFKA_TOPIC, KAFKA_INPUT_TOPIC, KAFKA_GROUP_ID } = process.env

const producer = kafka.producer()

async function processSignature(signature: ConfirmedSignatureInfo): Promise<any | null> {
  const txn = await connection.getConfirmedTransaction(signature.signature, FINALITY);
  const data = txn?.transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false
  }).toJSON().data
  const value = JSON.stringify({
    ...txn,
    transaction: data
  })
  const size = Buffer.byteLength(value);
  if (size > 500000) {
    console.log("Skipping large message at", signature)
    return null;
  }

  return {
    key: signature.signature.toString(),
    value,
    timestamp: ((signature?.blockTime || 0) * 1000).toString()
  };
}

function groupByN<T>(n: number, data: T[]): T[][] {
  let result = [];
  for (let i = 0; i < data.length; i += n) result.push(data.slice(i, i + n));
  return result;
};

type PromFunc<A> = () => Promise<A>;
async function promiseAllGrouped<A>(size: number, funcs: PromFunc<A>[], groupFinish: () => Promise<void>): Promise<A[]> {
  const results: A[] = [];
  const grouped = groupByN(size, funcs);
  for(let funcs of grouped) {
    await Promise.all(funcs.map(async func => {
      results.push(await func());      
    }))
    await groupFinish();
  }

  return results;
}

async function run() {
  const consumer = kafka.consumer({
    groupId: KAFKA_GROUP_ID!,
    maxBytes: process.env.MAX_BYTES ? Number(process.env.MAX_BYTES) : undefined
  });
  const admin = kafka.admin();
  await admin.connect();
  // Force failure if topic doesn't exist
  await admin.fetchTopicMetadata({ topics: [KAFKA_INPUT_TOPIC!] })
  await admin.disconnect();

  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({
    topic: KAFKA_INPUT_TOPIC!,
    fromBeginning: process.env["KAFKA_OFFSET_RESET"] === "earliest",
  });

  return new Promise((resolve, reject) => {
    consumer.run({
      eachBatchAutoResolve: true,
      autoCommitThreshold: process.env.AUTO_COMMIT_THRESHOLD ? Number(process.env.AUTO_COMMIT_THRESHOLD) : 20,
      eachBatch: async ({ batch: { messages }, heartbeat, commitOffsetsIfNecessary }) => {
        try {
          const groupSize = process.env.GROUP_SIZE ? Number(process.env.GROUP_SIZE) : 5;
          const toSend = (await promiseAllGrouped(
            groupSize,
            messages.map(({ value, offset }) => ({ ...JSON.parse(value!.toString()), offset })).map((confirmedSignatureInfo) => async () => {
              const msg = await processSignature(confirmedSignatureInfo)
              return msg;
            }),
            heartbeat
          )).filter(truthy)

          console.log(`Sending ${toSend.length} transactions`)
          const producerGroupSize = process.env.PRODUCER_GROUP_SIZE ? Number(process.env.PRODUCER_GROUP_SIZE) : 20;
          await Promise.all(groupByN(producerGroupSize, toSend).map(async (messages) => {
            await producer.send({
              topic: KAFKA_TOPIC!,
              messages
            });
            await heartbeat();
          }));
        } catch (e) {
          reject(e);
        }
      }
    })
  });
}

run().catch(e => {
  console.error(e);
  console.error(e.stack);
  process.exit(1);
})