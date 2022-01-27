import { Message, PublicKey, TokenBalance, MessageArgs, CompiledInstruction, ConfirmedTransaction, TransactionResponse } from "@solana/web3.js";
import { BlockTransaction, Transformer } from "./Transformer";
import { BinaryReader, deserializeUnchecked, baseDecode } from "borsh";
import BN from "bn.js";
import { Idl, Coder } from "@project-serum/anchor";
import { IdlAccountItem, IdlInstruction } from "@project-serum/anchor/dist/idl";
// @ts-ignore
import * as bs58 from "bs58";
import { stringify } from "uuid";
import { InstructionTransformer } from "./InstructionTransformer";

export type IdlWithMetadata = Idl & { metadata: { address: string } }

// Turn all BN into base 10 numbers as strings
function recursiveTransformBN(args: any): Record<string, any> {
  return Object.entries(args).reduce((acc, [key, value]) => {
    if (value instanceof BN) {
      acc[key] = value.toString(10);
    } else if (value instanceof PublicKey) {
      acc[key] = value.toBase58();
    } else if (value && (value as any)._bn) {
      acc[key] = new PublicKey(new BN((value as any)._bn, 'hex')).toBase58();
    } else if (typeof value === 'object' && value !== null) {
      acc[key] = recursiveTransformBN(value);
    } else {
      acc[key] = value;
    }

    return acc;
  }, {} as Record<string, any>);
}


export default class AnchorProgramTransformer extends InstructionTransformer {
  idl: IdlWithMetadata
  coder: Coder;
  instructionNamesToInstructions: Map<string, IdlInstruction>

  constructor(idl: IdlWithMetadata) {
    super();

    this.idl = idl;
    this.coder = new Coder(this.idl)
    this.instructionNamesToInstructions = this.idl.instructions?.reduce((acc, idlInstruction) => {
      acc.set(idlInstruction.name, idlInstruction);

      return acc;
    }, new Map<string, IdlInstruction>());
  }

  get relevantKeys(): Set<string> {
    return new Set([this.idl.metadata.address]);
  }


  // While not listed in the types, accounts can be nested. Recursively constrcut the map of accounts
  // ACCOUNTS WILL BE MUTATED. This operates by shifting on accounts
  getAccounts(accounts: PublicKey[], idlAccounts: IdlAccountItem[]): Record<string, any> {
    return idlAccounts.reduce((acc, idlAccount) => {
      // @ts-ignore
      if (idlAccount.accounts) {
        // @ts-ignore
        const output = this.getAccounts(accounts, idlAccount.accounts)
        acc[idlAccount.name] = output;
      } else {
        acc[idlAccount.name] = accounts.shift()?.toBase58()
      }

      return acc;
    }, {} as Record<string, any>)
  }

  transformInstruction(accountKeys: PublicKey[], transaction: TransactionResponse & { signature: string }, instruction: CompiledInstruction | CompiledInstruction): any[] {
    const programId = accountKeys[instruction.programIdIndex].toBase58();
    const ixData = bs58.decode(instruction.data);
    let codedInstruction = this.coder.instruction.decode(ixData);

    if (codedInstruction) {
      const idlAccounts = this.instructionNamesToInstructions.get(codedInstruction!.name)?.accounts!;
      const accountsAsPubkeys = instruction.accounts.map(accountIndex => accountKeys[accountIndex]);
      const accounts = this.getAccounts(accountsAsPubkeys, idlAccounts);

      return [{
        data: recursiveTransformBN(codedInstruction.data),
        accounts,
        programId,
        type: codedInstruction.name
      }]
    }

    return []
  }
}
