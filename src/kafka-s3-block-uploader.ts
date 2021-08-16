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
const { KAFKA_TOPIC } = process.env


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
      Key: `${S3_PREFIX}/${slot}.json.gz`,
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
        value: JSON.stringify(result)
      };
    } else {
      console.log(`No transactions in slot ${slot}`)
      outputMsg = {
        key: slot.toString(),
        value: JSON.stringify({
          slot,
          skipped: true
        })
      };
    }
  } catch (e) {
    if (e.message && e.message.includes(`Slot ${slot} was skipped`)) {
      console.log(`Slot ${slot} was skipped or missing`)
      outputMsg = {
        key: slot.toString(),
        value: JSON.stringify({
          slot,
          skipped: true,
          error: e.message
        })
      };
    } else {
      throw e;
    }
  }

  await producer.send({
    topic: KAFKA_TOPIC!,
    messages: [outputMsg]
  })
}

async function getKafkaSlot(): Promise<number | null> {
  console.log("Searching for last max block...")
  const consumer = kafka.consumer({
    groupId: `kafka-s3-block-writer-${uuidv4()}`
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
  const startSlot = (START_SLOT && Number(START_SLOT)) || await getKafkaSlot() || await connection.getSlot(FINALITY);
  await producer.connect();
  let currentSlot = startSlot;
  let maxSlot = await connection.getSlot(FINALITY);

  while (true) {
    if (currentSlot <= maxSlot) {
      await processSlot(currentSlot)
      currentSlot += 1
    }
    if (currentSlot > maxSlot) {
      console.log("Caught up, fetching current slot")
      maxSlot = await connection.getSlot(FINALITY)
      await sleep(1000) // If you set this too low, get too many requests
    }
  }
}

run().catch(e => {
  console.error(e);
  console.error(e.stack);
  process.exit(1);
})