import { PublicKey, TokenBalance } from "@solana/web3.js";
import { BlockTransaction, Transformer } from "./Transformer";
import { BinaryReader, deserializeUnchecked, baseDecode } from "borsh";
import BN from "bn.js";

export type Command = {
  index: number,
  name: string;
  accounts: string[];
  args: any
}
export type Spec = {
  programId: string,
  schema: Map<any, any>,
  commands: Command[]
}

// Turn all BN into base 10 numbers as strings
function transformBN(args: any): Map<string, any> {
  return Object.entries(args).reduce((acc, [key, value]) => {
    if (value instanceof BN) {
      acc.set(key, value.toString(10));
    } else {
      acc.set(key, value);
    }

    return acc;
  }, new Map<string, any>());
}

export default class ProgramSpecTransformer implements Transformer {
  specs: Spec[]

  constructor(...specs: Spec[]) {
    this.specs = specs;
  }

  get relevantKeys(): Set<string> {
    return new Set(this.specs.map(s => s.programId))
  }

  get programIdAndIndexToCommand(): Map<string, Map<number, Command>> {
    return this.specs.reduce((acc, spec) => {
      acc.set(spec.programId, spec.commands.reduce((acc2, command) => {
        acc2.set(command.index, command);
        return acc2
      }, new Map()));
      return acc;
    }, new Map());
  }

  get programIdToSchema(): Map<string, Map<any, any>> {
    const pids = new Map<string, Map<any, any>>();
    this.specs.forEach((spec: Spec) => {
      pids.set(spec.programId, spec.schema);
    })

    return pids;
  }

  transform(accountKeys: PublicKey[], transaction: BlockTransaction): any[] {
    return transaction.transaction.message.instructions
      .filter(instruction => this.relevantKeys.has(accountKeys[instruction.programIdIndex].toBase58()))
      .map(instruction => {
        const index = new BinaryReader(baseDecode(instruction.data)).readU8();
        const programId = accountKeys[instruction.programIdIndex].toBase58()
        const command = this.programIdAndIndexToCommand.get(programId)?.get(index)
        const schema = this.programIdToSchema.get(programId);
        if (command && schema) {
          const accounts = instruction.accounts.reduce((acc, account, index) => {
            acc.set(command.accounts[index], accountKeys[account].toBase58());

            return acc;
          }, new Map<any, any>());

          const args = deserializeUnchecked(schema, command.args, baseDecode(instruction.data));
          return {
            type: command.name,
            ...Object.fromEntries(accounts),
            ...transformBN(args)
          }
        }

        return null;
      })
      .filter(Boolean)
  }
}
