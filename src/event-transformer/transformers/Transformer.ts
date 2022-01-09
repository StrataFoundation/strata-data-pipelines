import { ConfirmedTransaction, ConfirmedTransactionMeta, Message, PublicKey } from "@solana/web3.js";

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
  transform(accountKeys: PublicKey[], transaction: ConfirmedTransaction): TransformedMessage[]
}