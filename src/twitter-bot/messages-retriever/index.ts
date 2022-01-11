import { LRU } from "../../utils/lru";
import { kafka } from "../../setup/kafka";
import { twitterClient } from "../../setup/twitter";

const { KAFKA_TOPIC, POLL_DURATION = 60 * 1000 } = process.env

export async function sleep(ts: number) {
  return new Promise((resolve) => {
   setTimeout(resolve, ts);
  })
}

const FETCH_SIZE = 20
const lru = new LRU(FETCH_SIZE);

async function populateLRU(): Promise<void> {
  console.log("Searching for last messages...")
  const consumer = kafka.consumer({
    groupId: `twitter-messages-retriver`
  });

  await consumer.connect();
  await consumer.subscribe({
    topic: KAFKA_TOPIC!,
    fromBeginning: false
  });
  const admin = kafka.admin();
  await admin.connect();
  
  consumer.run({
    eachBatchAutoResolve: false,
    eachBatch: async ({ batch: { messages } }) => {
      messages.forEach(message => {
        const msg = JSON.parse(message.value!.toString())
        lru.set(msg.id, msg);
      })
    }
  })

  const offsets = await admin.fetchTopicOffsets(KAFKA_TOPIC!)
  await Promise.all(
    offsets.map(async offset => {
      await consumer.seek({
        topic: KAFKA_TOPIC!,
        partition: offset.partition,
        offset: Math.max(Number(offset.high) - (FETCH_SIZE + 5), 0).toString()
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
      resolve()
    }, 60 * 1000)
  })
}


async function getRecentMessages(cursor?: string): Promise<any[]> {
  const messages = await twitterClient.v1.get("/direct_messages/events/list.json", {
    cursor
  })
  const filtered = messages.events
    .filter((message: any) => !lru.get(message.id));

  filtered.forEach((m: any) => lru.set(m.id, m));

  // If none of these messages were in our lru, fetch more
  if (messages.next_cursor && filtered.length == messages.events.length) {
    console.log(`More than ${FETCH_SIZE} new messages, fetching more...`)
    await sleep(2000)
    return [...filtered, ...await getRecentMessages(messages.next_cursor)]
  }

  return filtered;
}

const userInfoCache = new LRU<string, { handle: string, name: string }>(1000);

async function getUserInfo(userId: string): Promise<{ handle: string, name: string }> {
  if (userInfoCache.get(userId)) {
    return userInfoCache.get(userId)!;
  }
  
  const user = await twitterClient.v1.user({
    user_id: userId
  });

  const ret = {
    handle: user.screen_name,
    name: user.name,
  }
  userInfoCache.set(userId, ret);

  return ret;
}

export type Truthy<T> = T extends false | "" | 0 | null | undefined ? never : T; // from lodash

export const truthy = <T>(value: T): value is Truthy<T> => !!value;

async function run() {
  const producer = kafka.producer()
  await producer.connect();
  await populateLRU();

  while (true) {
    console.log("Fetching messages...")
    const messages = await getRecentMessages();
    const messagesWithHandles = (await Promise.all(messages.map(async (message: any) => {
      if (message.message_create) {
        const userId = message.message_create.sender_id;
  
        return {
          ...await getUserInfo(userId),
          body: message.message_create.message_data.text,
          id: message.id,
          userId,
          createdTimestamp: message.created_timestamp
        }
      }
    }))).filter(truthy);
  
    await producer.send({
      topic: KAFKA_TOPIC!,
      messages: messagesWithHandles.map(message => ({
        key: message.id,
        value: JSON.stringify(message),
        timestamp: message.createdTimestamp as string
      }))
    })
    await sleep(Number(POLL_DURATION))
  }

}

run().catch(e => {
  console.error(e);
  console.error(e.stack);
  process.exit(1);
})
