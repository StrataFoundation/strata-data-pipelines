import { ConfirmedSignatureInfo, Connection, Finality, PublicKey } from "@solana/web3.js";
import { kafka } from "./setup/kafka";
import { connection } from "./setup/solana";
import { v4 as uuidv4 } from "uuid";

const START_SIGNATURE = process.env["START_SIGNATURE"];
const FINALITY: Finality = (process.env["FINALITY"] || 'finalized') as Finality;
const { KAFKA_TOPIC } = process.env
const ADDRESS = new PublicKey(process.env["ADDRESS"]!);
const SLEEP_TIME = process.env.SLEEP_TIME ? Number(process.env.SLEEP_TIME) : 2000;

const producer = kafka.producer()

async function getKafkaSignature(): Promise<string | null> {
  console.log("Searching for last max block...")
  const consumer = kafka.consumer({
    groupId: `kafka-s3-signature-identifier-${uuidv4()}`,
    maxBytes: 20
  });

  await consumer.connect();
  await consumer.subscribe({
    topic: KAFKA_TOPIC!,
    fromBeginning: false
  });
  const admin = kafka.admin();
  await admin.connect();
  
  let signature: string | null = null
  consumer.run({
    eachBatchAutoResolve: false,
    eachBatch: async ({ batch: { messages } }) => {
      const message = messages[0];
      if (message) {
        signature = JSON.parse(message.value!.toString()).signature
      }
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
      console.log(`Found signature ${signature} in kafka`)
      resolve(signature)
    }, 60 * 1000)
  })
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(null), ms);
  })
}

async function sendAllSignatures(connection: Connection, until?: string, before?: string): Promise<ConfirmedSignatureInfo[]> {
  const signatures = await connection.getConfirmedSignaturesForAddress2(
    ADDRESS,
    {
      until,
      before
    },
    FINALITY
  );

  await producer.sendBatch({
    acks: 1,
    topicMessages: [{
      topic: KAFKA_TOPIC!,
      messages: signatures.map(sig => ({
        value: JSON.stringify(sig),
        key: sig.signature.toString(),
        timestamp: ((sig.blockTime || 0) * 1000).toString()
      }))
    }]
  });

  if (signatures.length === 1000) {
    await sendAllSignatures(connection, until, signatures[signatures.length - 1].signature)
  }

  return signatures;
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
        numPartitions: process.env.NUM_PARTITIONS ? Number(process.env.NUM_PARTITIONS) : 1
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

  const startSignature = await getKafkaSignature() || START_SIGNATURE || await getSolanaRecentSignature()

  await producer.connect();
  let currentSignature = startSignature;
  while (true) {
    const signatures = await sendAllSignatures(connection, currentSignature || undefined)
    if (signatures.length > 0) {
      console.log(`Fetched ${signatures.length} signatures from ${currentSignature}`);
      currentSignature = signatures[0].signature
    } else {
      await sleep(SLEEP_TIME);
    }
  }
}

run().catch(e => {
  console.error(e);
  console.error(e.stack);
  process.exit(1);
})

async function getSolanaRecentSignature(): Promise<string | null> {
  const curr = (await connection.getSignaturesForAddress(ADDRESS, {
    limit: 1
  }, FINALITY))
  if (curr.length > 0) {
    return curr[0].signature;
  }

  return null;
}
