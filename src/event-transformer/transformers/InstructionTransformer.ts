import { CompiledInstruction, ConfirmedTransactionMeta, Message, PublicKey, Transaction } from "@solana/web3.js";
import { BlockTransaction, TransformedMessage, Transformer } from "./Transformer";

export abstract class InstructionTransformer implements Transformer {
  abstract get relevantKeys(): Set<string>;

  transform(accountKeys: PublicKey[], transaction: BlockTransaction): TransformedMessage[] {
    const indexedNormalInstrs = transaction.transaction.message.instructions
      .map((instruction, index) => ({ instruction, instructionIndex: index, innerInstructionIndex: null }))
    const indexedInnerInstrs = (transaction.meta?.innerInstructions || [])
      .flatMap((innerInstruction) =>
        innerInstruction.instructions.map((instruction, index) =>
          ({ instruction, instructionIndex: index, innerInstructionIndex: innerInstruction.index })
        ))
    const instrs = [...indexedInnerInstrs, ...indexedNormalInstrs];

    return instrs.flatMap(({ instruction, instructionIndex, innerInstructionIndex: innerIndex }) => 
      this.transformInstruction(accountKeys, transaction, instruction).map(message => ({
        ...message,
        instructionIndex,
        innerIndex
      }))
    )
  }

  abstract transformInstruction(accountKeys: PublicKey[], transaction: BlockTransaction, instruction: CompiledInstruction): TransformedMessage[]
}