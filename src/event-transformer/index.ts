import "./borsh";
import { Program, Provider, Wallet as NodeWallet } from "@project-serum/anchor";
import { BlockResponse, Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { Message as KafkaMessage, Producer, TopicMessages } from "kafkajs";
import { kafka } from "../setup/kafka";
import { s3 } from "../setup/s3";
import { connection } from "../setup/solana";
import "../utils/borshWithPubkeys";
import AnchorProgramTransformer from "./transformers/anchorProgram";
import ProgramSpecTransformer from "./transformers/programSpec";
import associatedTokenSpec from "./transformers/specs/associatedToken";
import nameSpec from "./transformers/specs/name";
import tokenSpec from "./transformers/specs/token";
import tokenMetadataSpec from "./transformers/specs/tokenMetadata";
import TokenAccountTransformer from "./transformers/tokenAccounts";
import { BlockTransaction, Transformer } from "./transformers/Transformer";

const { KAFKA_GROUP_ID, KAFKA_INPUT_TOPIC, KAFKA_OUTPUT_TOPIC } = process.env

const producer = kafka.producer({
   maxInFlightRequests: 1, 
   idempotent: true,
   transactionalId: 'kafka-token-transaction-processor',
});

function hasIntersect(set1: Set<any>, set2: Set<any>): boolean {
  return [...set1].some(x => set2.has(x));
}

function processTxn(transformers: Transformer[], block: BlockResponse & { slot: number }, txn: BlockTransaction): KafkaMessage[] {
  const accounts = txn.transaction.message.accountKeys.map((key) => (
    // @ts-ignore
    new PublicKey(new BN(key._bn, 'hex'))
  ));
  const accountsSet = new Set(accounts.map(a => a.toBase58()));
  
  return transformers
    .filter((t) => hasIntersect(accountsSet, t.relevantKeys))
    .flatMap(t => t.transform(accounts, txn))
    .map((item: any) => {
      const { type, ...payload } = item;
      return {
        type,
        payload,
        slot: block.slot,
        recentBlockhash: txn.transaction.message.recentBlockhash,
        blockTime: block.blockTime,
        blockhash: block.blockhash
      }
    })
    .map((item: any) => ({
      key: block.slot.toString(),
      value: JSON.stringify(item),
      timestamp: ((block.blockTime || 0) * 1000).toString()
    }))
}

function sliceIntoChunks<A>(arr: A[], chunkSize: number): A[][] {
  const res = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
      const chunk = arr.slice(i, i + chunkSize);
      res.push(chunk);
  }
  return res;
}

type PromFunc<A> = () => Promise<A>;
async function linearPromiseAll<A>(funcs: PromFunc<A>[]): Promise<A[]> {
  const results = [];
  for(let func of funcs) {
    results.push(await func());
  }

  return results;
}

// Need to break into smaller batches since js client doesn't have advanced linger.ms features.
// So it'll just naively send way too large of a message and kafka will choke.
async function publishFixedBatches(producer: Producer, batch: TopicMessages, maxSize: number = 1000) {
  return linearPromiseAll(sliceIntoChunks(batch.messages || [], 1000).map(chunk => () =>
    producer.sendBatch({
      topicMessages: [{
        ...batch,
        messages: chunk
      }]
    })
  ))
}

async function run() {
  const idls = await Promise.all((process.env["ANCHOR_IDLS"]?.split(",").map(v => v.trim()) || []).map(async idlPubkey => {
    const idl = await Program.fetchIdl(idlPubkey, new Provider(
      connection,
      new NodeWallet(new Keypair),
      {}
    ))
    idl.metadata = {
      address: idlPubkey
    }
    return idl;
  }))

  const transformers: Transformer[] = [
    new TokenAccountTransformer(), 
    new ProgramSpecTransformer(tokenMetadataSpec, associatedTokenSpec, tokenSpec, nameSpec),
    ...idls.map(idl => new AnchorProgramTransformer(idl))
  ];
  const consumer = kafka.consumer({
    groupId: KAFKA_GROUP_ID!
  });

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
          const results = (await Promise.all(
            messages
              .map((message: any) => JSON.parse(message.value!.toString()))
              .filter(item => !item.skipped)
              .map(async (value: any) => {
                const s3Resp = (await s3.getObject({
                  Key: value.Key,
                  Bucket: value.Bucket
                }).promise())
                const block: BlockResponse & { slot: number } = JSON.parse(s3Resp.Body!.toString());
                const ret: KafkaMessage[] = block.transactions
                  .filter(txn => !txn.meta?.err)
                  .flatMap((txn: BlockTransaction) => processTxn(transformers, block, txn))
  
                return ret;
              })
          )).flat()
          console.log(`Sending batch of ${results.length} events`)
          await publishFixedBatches(producer, {
            topic: KAFKA_OUTPUT_TOPIC!,
            messages: results
          });
        } catch (e) {
          reject(e);
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

