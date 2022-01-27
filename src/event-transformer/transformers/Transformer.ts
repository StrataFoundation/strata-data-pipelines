import { ConfirmedTransaction, ConfirmedTransactionMeta, Message, PublicKey, TransactionResponse } from "@solana/web3.js";

export type BlockTransaction = {
  transaction: {
    message: Message
    signatures: string[]
  },
  meta: ConfirmedTransactionMeta | null;
};

export interface TransformedMessage {
  type: string;
}

export interface Transformer {
  get relevantKeys(): Set<string>
  transform(accountKeys: PublicKey[], transaction: TransactionResponse & { signature: string }): TransformedMessage[]
}