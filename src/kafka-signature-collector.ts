// Gets the signatures and filters for unique sigs, combining them into one topic

import { ConfirmedSignatureInfo, Finality } from "@solana/web3.js";
import { kafka } from "./setup/kafka";

const { KAFKA_TOPIC, KAFKA_INPUT_TOPIC, KAFKA_GROUP_ID } = process.env

const producer = kafka.producer()

class LRU<A, B> {
  max: number;
  cache: Map<A, B>;

  constructor(max = 10) {
      this.max = max;
      this.cache = new Map();
  }

  get(key: A): B | undefined {
      let item = this.cache.get(key);
      if (item) {
          // refresh key
          this.cache.delete(key);
          this.cache.set(key, item);
      }
      return item;
  }

  set(key: A, val: B) {
      // refresh key
      if (this.cache.has(key)) this.cache.delete(key);
      // evict oldest
      else if (this.cache.size == this.max) this.cache.delete(this.first());
      this.cache.set(key, val);
  }

  first() {
      return this.cache.keys().next().value;
  }
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
        numPartitions: process.env.NUM_PARTITIONS ? Number(process.env.NUM_PARTITIONS) : 6,
        replicationFactor: process.env.REPLICATION ? Number(process.env.REPLICATION) : 1
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

  const consumer = kafka.consumer({
    groupId: KAFKA_GROUP_ID!,
    maxBytes: process.env.MAX_BYTES ? Number(process.env.MAX_BYTES) : undefined
  });

  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({
    topic: new RegExp(KAFKA_INPUT_TOPIC!),
    fromBeginning: process.env["KAFKA_OFFSET_RESET"] === "earliest",
  });

  const lru = new LRU(process.env.LRU_MAX ? Number(process.env.LRU_MAX) : 100000);

  return new Promise((resolve, reject) => {
    consumer.run({
      eachBatchAutoResolve: true,
      autoCommitThreshold: process.env.AUTO_COMMIT_THRESHOLD ? Number(process.env.AUTO_COMMIT_THRESHOLD) : 20,
      eachBatch: async ({ batch: { messages } }) => {
        try {
          const sendable = messages.filter(m => 
            !lru.get(m.key)
          ).map(m => {
            lru.set(m.key, m.key);
            return m;
          });
          if (sendable.length > 0) {
            await producer.send({
              topic: KAFKA_TOPIC!,
              messages: sendable
            })
          }
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