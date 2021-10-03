import { Finality } from "@solana/web3.js";
import { Message as KafkaMessage } from "kafkajs";
import { kafka } from "./setup/kafka";
import { s3 } from "./setup/s3";
import { connection } from "./setup/solana";
import { v4 as uuidv4 } from "uuid";

const START_SLOT = process.env["START_SLOT"];
const FINALITY: Finality = (process.env["FINALITY"] || 'finalized') as Finality;
const S3_BUCKET = process.env["S3_BUCKET"]!
const S3_PREFIX = process.env["S3_PREFIX"]!
const ACCOUNTS = new Set(process.env["ACCOUNTS"]!.split(","))
const { KAFKA_TOPIC, KAFKA_INPUT_TOPIC, KAFKA_GROUP_ID } = process.env

const producer = kafka.producer()

/**
 * Format bytes as human-readable text.
 * 
 * @param bytes Number of bytes.
 * @param si True to use metric (SI) units, aka powers of 1000. False to use 
 *           binary (IEC), aka powers of 1024.
 * @param dp Number of decimal places to display.
 * 
 * @return Formatted string.
 */
 function humanFileSize(bytes: number, si=false, dp=1) {
  const thresh = si ? 1000 : 1024;

  if (Math.abs(bytes) < thresh) {
    return bytes + ' B';
  }

  const units = si 
    ? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'] 
    : ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
  let u = -1;
  const r = 10**dp;

  do {
    bytes /= thresh;
    ++u;
  } while (Math.round(Math.abs(bytes) * r) / r >= thresh && u < units.length - 1);


  return bytes.toFixed(dp) + ' ' + units[u];
}

async function processSlot(slot: number) {
  let outputMsg: KafkaMessage;
  try {
    const block = await connection.getBlock(slot, { commitment: FINALITY });
    const fileInfo = {
      Bucket: S3_BUCKET,
      Key: `${S3_PREFIX}/${slot.toString().padStart(16, '0')}.json.gz`,
    }
    const filteredBlock = {
      ...block,
      slot,
      transactions: block?.transactions.filter(transaction => transaction.transaction.message.accountKeys.some(key => ACCOUNTS.has(key.toBase58())))
    }

    if ((filteredBlock.transactions?.length || 0) > 0) {
      await s3.putObject({
        ...fileInfo,
        Body: JSON.stringify(filteredBlock),
        ContentType: 'application/json; charset=utf-8',
        ContentEncoding: 'gzip'
      }).promise()
    
      const contentLength = (await s3.headObject(fileInfo).promise()).ContentLength;
      const { parentSlot, blockTime, previousBlockhash, blockhash } = block || {};
    
      const result = {
        parentSlot,
        blockTime,
        previousBlockhash,
        blockhash,
        slot,
        contentLength,
        ...fileInfo
      }
      console.log(`Processed slot ${slot}, size: ${humanFileSize(contentLength || 0)}`)
    
      outputMsg = {
        key: slot.toString(),
        value: JSON.stringify(result),
        timestamp: ((block?.blockTime || 0) * 1000).toString()
      };
    } else {
      console.log(`No transactions in slot ${slot}`)
      outputMsg = {
        key: slot.toString(),
        value: JSON.stringify({
          slot,
          skipped: true
        }),
        timestamp: ((block?.blockTime || 0) * 1000).toString()
      };
    }
  } catch (e) {
    console.error(e);
    outputMsg = {
      key: slot.toString(),
      value: JSON.stringify({
        slot,
        skipped: true,
        error: e.message,
      })
    };
  }

  await producer.send({
    topic: KAFKA_TOPIC!,
    messages: [outputMsg]
  })
}

async function run() {
  const consumer = kafka.consumer({
    groupId: KAFKA_GROUP_ID!,
    maxBytes: 200
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
    fromBeginning: process.env["KAFKA_OFFSET_RESET"] === "earliest"
  });

  return new Promise((resolve, reject) => {
    consumer.run({
      eachBatch: async ({ batch: { messages } }) => {
        try {
          await Promise.all(
            messages.map(({ value }) => JSON.parse(value!.toString()).slot).map(slot =>
              processSlot(slot)
            )
          )
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