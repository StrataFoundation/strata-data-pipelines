import { kafka } from "../setup/kafka";
import { s3 } from "../setup/s3";
import { TokenBalance, Message, BlockResponse, ConfirmedTransactionMeta, PublicKey, Transaction } from "@solana/web3.js";
import { Message as KafkaMessage } from "kafkajs";
import { BlockTransaction, Transformer } from "./transformers/Transformer";
import TokenAccountTransformer from "./transformers/tokenAccounts";
import BN from "bn.js";
import "../utils/borshWithPubkeys";
import wumboSpec from "./transformers/specs/wumbo";
import tokenBondingSpec from "./transformers/specs/tokenBonding";
import ProgramSpecTransformer from "./transformers/programSpec";

const { KAFKA_GROUP_ID, KAFKA_INPUT_TOPIC, KAFKA_OUTPUT_TOPIC } = process.env

const producer = kafka.producer({
   maxInFlightRequests: 1, 
   idempotent: true,
   transactionalId: 'kafka-token-transaction-processor',
});

function hasIntersect(set1: Set<any>, set2: Set<any>): boolean {
  return [...set1].some(x => set2.has(x));
}

const transformers: Transformer[] = [
  new TokenAccountTransformer(), 
  new ProgramSpecTransformer(wumboSpec, tokenBondingSpec)
];
function processTxn(block: BlockResponse & { slot: number }, txn: BlockTransaction): KafkaMessage[] {
  const accounts = txn.transaction.message.accountKeys.map((key) => (
    // @ts-ignore
    new PublicKey(new BN(key._bn, 'hex'))
  ));
  const accountsSet = new Set(accounts.map(a => a.toBase58()));
  
  return transformers
    .filter((t) => hasIntersect(accountsSet, t.relevantKeys))
    .flatMap(t => t.transform(accounts, txn))
    .map((item : any) => ({
      ...item,
      slot: block.slot,
      blockTime: block.blockTime,
      blockhash: block.blockhash
    }))
    .map((item: any) => ({
      key: block.slot.toString(),
      value: JSON.stringify(item)
    }))
}

async function run() {
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
                  .flatMap((txn: BlockTransaction) => processTxn(block, txn))
  
                return ret;
              })
          )).flat()
          console.log(`Sending batch of ${results.length} events`)
          await producer.sendBatch({
            topicMessages: [{
              topic: KAFKA_OUTPUT_TOPIC!,
              messages: results
            }]
          })
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

