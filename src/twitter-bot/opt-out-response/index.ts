import { twitterClient } from "../../setup/twitter";
import { promiseAllGrouped } from "../../utils/group";
import { kafka } from "../../setup/kafka";

const { KAFKA_INPUT_TOPIC, KAFKA_GROUP_ID } = process.env

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
          await promiseAllGrouped(
            process.env.GROUP_SIZE ? Number(process.env.GROUP_SIZE) : 5,
            messages.map(({ value, offset }) => ({ ...JSON.parse(value!.toString()), offset })).map((message) => async () => {
              const userId = message.userId;
              let text;
              if (message.error) {
                text = message.error;
              } else if (message.optedOut) {
                text = "Opt Out Successful! We're sorry to see you go."
              }
              if (userId) {
                await twitterClient.v1.post("/direct_messages/events/new.json", {
                  event: {
                    type: "message_create",
                    message_create: {
                      target: {
                        recipient_id: userId
                      },
                      message_data: {
                        text
                      }
                    }
                  }
                }, {
                  forceBodyMode: "json"
                });
              }

              await heartbeat();
            })
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