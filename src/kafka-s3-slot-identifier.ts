import { Finality } from "@solana/web3.js";
import { kafka } from "./setup/kafka";
import { connection } from "./setup/solana";
import { v4 as uuidv4 } from "uuid";

const START_SLOT = process.env["START_SLOT"];
const FINALITY: Finality = (process.env["FINALITY"] || 'finalized') as Finality;
const { KAFKA_TOPIC } = process.env

const producer = kafka.producer()

async function getKafkaSlot(): Promise<number | null> {
  console.log("Searching for last max block...")
  const consumer = kafka.consumer({
    groupId: `kafka-s3-block-identifier-${uuidv4()}`
  });

  await consumer.connect();
  await consumer.subscribe({
    topic: KAFKA_TOPIC!,
    fromBeginning: false
  });
  const admin = kafka.admin();
  await admin.connect();
  
  let maxSlot: number | null = null
  consumer.run({
    eachBatchAutoResolve: false,
    eachBatch: async ({ batch: { messages } }) => {
      messages.forEach(message => {
        const msgSlot = JSON.parse(message.value!.toString()).slot
        if (msgSlot > (maxSlot || 0)) {
          maxSlot = msgSlot
        }
      })
    }
  })

  const offsets = await admin.fetchTopicOffsets(KAFKA_TOPIC!)
  await Promise.all(
    offsets.map(async offset => {
      await consumer.seek({
        topic: KAFKA_TOPIC!,
        partition: offset.partition,
        offset: (Number(offset.high) - 1).toString()
      })
    })
  );

  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      try {
        await admin.disconnect();
        await consumer.disconnect()
      } catch (e) {
        reject(e)
      }
      console.log(`Found slot ${maxSlot} in kafka`)
      resolve(maxSlot ? maxSlot + 1 : maxSlot)
    }, 10 * 1000)
  })
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(null), ms);
  })
}

async function run() {
  const admin = kafka.admin();
  await admin.connect()
  try {
    await admin.fetchTopicMetadata({ topics: [KAFKA_TOPIC!] })
  } catch (e) {
    const created = await admin.createTopics({
      waitForLeaders: true,
      topics: [{
        topic: KAFKA_TOPIC!,
        numPartitions: process.env.NUM_PARTITIONS ? Number(process.env.NUM_PARTITIONS) : 6
      }]
    })
    if (!created) {
      console.log("Could not create topic", KAFKA_TOPIC);
      throw new Error("Failed to create topic")
    } else {
      console.log("Created topic", KAFKA_TOPIC);
    }
  }
  await admin.disconnect()

  const startSlot = (START_SLOT && Number(START_SLOT)) || await getKafkaSlot() || await connection.getSlot(FINALITY);
  await producer.connect();
  let currentSlot = startSlot;
  let maxSlot = await connection.getSlot(FINALITY);

  let msgs = [];
  let batchSize = 100;
  while (true) {
    if (currentSlot <= maxSlot) {
      msgs.push({
        topic: KAFKA_TOPIC!,
        messages: [{
          key: `${currentSlot}`,
          value: JSON.stringify({
            slot: currentSlot
          })
        }]
      })
      currentSlot += 1
    }
    if (currentSlot > maxSlot || msgs.length > batchSize) {
      await producer.sendBatch({
        acks: 1,
        topicMessages: msgs
      });
      msgs = [];
      console.log("Caught up, fetching current slot")
      maxSlot = await connection.getSlot(FINALITY)
      await sleep(2000) // If you set this too low, get too many requests
    }
  }
}

run().catch(e => {
  console.error(e);
  console.error(e.stack);
  process.exit(1);
})