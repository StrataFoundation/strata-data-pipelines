import { kafka } from "../../setup/kafka";
import { twitterClient } from "../../setup/twitter";

const { KAFKA_GROUP_ID, KAFKA_INPUT_TOPIC, MESSAGE, COLLECTIVE } = process.env

async function run() {
  const consumer = kafka.consumer({
    groupId: KAFKA_GROUP_ID!,
    maxBytes: 100
  });

  await consumer.connect();
  await consumer.subscribe({
    topic: KAFKA_INPUT_TOPIC!,
    fromBeginning: process.env["KAFKA_OFFSET_RESET"] === "earliest"
  });

  async function promiseAllInOrder<T>(it: (() => Promise<T>)[]): Promise<Iterable<T>> {
    let ret: T[] = [];
    for (const i of it) {
      ret.push(await i());
    }
  
    return ret;
  }

  return new Promise((resolve, reject) => {
    consumer.run({
      eachBatch: async ({ batch: { messages: batchMessages } }) => {
        try {
          const messages = batchMessages.map(m => JSON.parse(m.value!.toString()))
                                        .filter(m => COLLECTIVE ? m.collective == COLLECTIVE : true);
          await promiseAllInOrder(
            messages.map(message => async () => {
              const handle = message.tokenMetadataName;

              console.log("Sending req");
              const response = await twitterClient.v2.tweet(`@${handle} ${MESSAGE}`);
              if (response.errors) {
                console.error(JSON.stringify(response, null, 2));
                throw new Error("Failed to post tweet")
              }

              const tweetId = response.data.id;
              console.log(`Sent tweet to ${handle} at id ${tweetId}`);
            })
          )
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

