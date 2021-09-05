import { Message, PublicKey, TokenBalance, MessageArgs, CompiledInstruction } from "@solana/web3.js";
import { BlockTransaction, Transformer } from "./Transformer";
import { BinaryReader, deserializeUnchecked, baseDecode } from "borsh";
import BN from "bn.js";
import { Idl, Coder } from "@project-serum/anchor";
import { IdlInstruction } from "@project-serum/anchor/dist/idl";
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
    this.instructionNamesToInstructions = this.idl.instructions?.reduce((acc, IdlInstruction) => {
      acc.set(IdlInstruction.name, IdlInstruction);

      return acc;
    }, new Map<string, IdlInstruction>());
  }

  get relevantKeys(): Set<string> {
    return new Set([this.idl.metadata.address]);
  }

  transformInstruction(accountKeys: PublicKey[], transaction: BlockTransaction, instruction: CompiledInstruction): any[] {
    const programId = accountKeys[instruction.programIdIndex].toBase58();
    const ixData = bs58.decode(instruction.data);
    let codedInstruction = this.coder.instruction.decode(ixData);

    if (codedInstruction) {
      const accounts = instruction.accounts.reduce((acc, account, index) => {
        const accountName = this.instructionNamesToInstructions.get(codedInstruction!.name)?.accounts[index].name;
        if (accountName) {
          acc[accountName] = accountKeys[account].toBase58()
        }

        return acc;
      }, {} as Record<string, any>);

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
