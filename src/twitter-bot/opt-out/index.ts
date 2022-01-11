import { Provider } from "@project-serum/anchor";
import { getHashedName, getNameAccountKey, NameRegistryState } from "@solana/spl-name-service";
import { ConfirmedSignatureInfo, Finality, Keypair, PublicKey } from "@solana/web3.js";
import { SplTokenCollective } from "@strata-foundation/spl-token-collective";
import { deserializeUnchecked } from "borsh";
import { promiseAllGrouped } from "../../utils/group";
import { kafka } from "../../setup/kafka";
import { connection } from "../../setup/solana";
import { Wallet as NodeWallet } from "@project-serum/anchor";

const { KAFKA_TOPIC, KAFKA_INPUT_TOPIC, KAFKA_GROUP_ID } = process.env

const twitterServiceAccount = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(process.env.TWITTER_SERVICE_ACCOUNT!))
);
const payerServiceAccount = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(process.env.PAYER_SERVICE_ACCOUNT!))
);

const TLD = new PublicKey(process.env["TWITTER_TLD"]!);

const producer = kafka.producer()

async function getTwitterRegistryKey(
  handle: string,
  twitterRootParentRegistryKey?: PublicKey
): Promise<PublicKey> {
  const hashedTwitterHandle = await getHashedName(handle);
  const twitterHandleRegistryKey = await getNameAccountKey(
    hashedTwitterHandle,
    undefined,
    twitterRootParentRegistryKey
  );

  return twitterHandleRegistryKey;
}

async function getOwnerForName(
  handle: string | undefined,
  tld: PublicKey | undefined
): Promise<PublicKey | undefined> {
  const key = handle && await getTwitterRegistryKey(handle, tld);
  if (key) {
    const registryRaw = await connection.getAccountInfo(key);
    const registry = registryRaw && deserializeUnchecked(
      NameRegistryState.schema,
      NameRegistryState,
      registryRaw.data
    );
  
    return registry?.owner;
  }
}

export async function getClaimedTokenRefKeyForName(
  handle: string,
  mint: PublicKey | undefined | null = undefined,
  tld: PublicKey
): Promise<PublicKey | undefined> {
  const owner = await getOwnerForName(handle, tld);
  if (owner) {
    return (
      await SplTokenCollective.ownerTokenRefKey({
        owner,
        mint,
      })
    )[0];
  }
}
export async function getUnclaimedTokenRefKeyForName(
  handle: string,
  mint: PublicKey | undefined | null,
  tld: PublicKey | undefined
): Promise<PublicKey> {
  const name = await getTwitterRegistryKey(handle, tld);

  return (
    await SplTokenCollective.ownerTokenRefKey({
      name,
      mint: mint || SplTokenCollective.OPEN_COLLECTIVE_MINT_ID,
    })
  )[0];
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

  const tokenCollectiveSdk = await SplTokenCollective.init(new Provider(connection, new NodeWallet(payerServiceAccount), {}));

  return new Promise((resolve, reject) => {
    consumer.run({
      eachBatchAutoResolve: true,
      autoCommitThreshold: process.env.AUTO_COMMIT_THRESHOLD ? Number(process.env.AUTO_COMMIT_THRESHOLD) : 20,
      eachBatch: async ({ batch: { messages }, heartbeat, commitOffsetsIfNecessary }) => {
        try {
          const toProduceMessages = await promiseAllGrouped(
            process.env.GROUP_SIZE ? Number(process.env.GROUP_SIZE) : 5,
            messages.map(({ value, offset }) => ({ ...JSON.parse(value!.toString()), offset })).filter(m => m.handle != process.env.HANDLE).map((message) => async () => {
              const handle = message.handle;
              const dm = message.body as string | undefined;
              if (dm?.trim().toUpperCase() === "OPT OUT") {
                const unclaimedRefKey = await getUnclaimedTokenRefKeyForName(handle, null, TLD);
                const unclaimedTokenRef = await tokenCollectiveSdk.getTokenRef(unclaimedRefKey);
                await heartbeat()

                if (!unclaimedTokenRef) {
                  return {
                    ...message,
                    error: `No social token was found for ${handle}`
                  }
                } else if (unclaimedTokenRef?.isOptedOut) {
                  return {
                    ...message,
                    error: `${handle} has already been opted out`
                  }
                }

                if (unclaimedTokenRef) {
                  const { instructions, signers } = await tokenCollectiveSdk.optOutInstructions({
                    tokenRef: unclaimedRefKey!,
                    handle,
                    nameParent: TLD
                  });
                  await tokenCollectiveSdk.sendInstructions(instructions, [...signers, twitterServiceAccount], payerServiceAccount.publicKey);
                }

                return {
                  ...message,
                  optedOut: true,
                  tokenRef: unclaimedRefKey
                }
              } else {
                return {
                  ...message,
                  error: process.env.INCORRECT_MESSAGE_RESPONSE
                }
              }
            })
          )
          await producer.send({
            topic: KAFKA_TOPIC!,
            messages: toProduceMessages.map(message => ({
              key: message.handle,
              value: JSON.stringify(message)
            }))
          })
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