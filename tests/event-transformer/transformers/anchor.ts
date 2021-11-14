import { expect, use } from "chai";
import idl from "../../resources/anchor-bonding-def.json";
import wumboIdl from "../../resources/spl_wumbo.json";
import blockResp from "../../resources/anchor-bonding-transaction.json";
import wumboBlockResp from "../../resources/anchor-wumbo-transaction.json";
import AnchorProgramTransformer, { IdlWithMetadata } from "../../../src/event-transformer/transformers/anchorProgram";
import { PublicKey, BlockResponse } from "@solana/web3.js";
import { BN } from "@project-serum/anchor";

describe("anchor-transformer", () => {
  it ('should transform anchor definitions into events', () => {
    const transformer = new AnchorProgramTransformer(idl as IdlWithMetadata);
    const block: BlockResponse & { slot: number } = blockResp as any;
    const mapped: any = block.transactions.flatMap(txn => {
      const accounts = txn.transaction.message.accountKeys.map((key) => (
        // @ts-ignore
        new PublicKey(new BN(key._bn, 'hex'))
      ));

      return transformer.transform(accounts, txn)
    })[0];

    expect(mapped.data.args.logCurveV0.c).to.equal("1000000000000");
    expect(mapped.data.args.logCurveV0.g).to.equal("100000000000");
    expect(mapped.data.args.logCurveV0.taylorIterations).to.equal(15);

    const { payer, curve } = mapped.accounts;
    expect(payer).to.equal('C6uY3FCNz76k5kDjaYtHyedgzXW8fsJABXg3R7rfc7fA');
    expect(curve).to.equal('G2J17bwMJc6fZ6GimJ4Pj8Grf7bdsxb467ZceqUHGRHR');
  })

  it ('should transform anchor definitions with nested accounts into events', () => {
    const transformer = new AnchorProgramTransformer(wumboIdl as IdlWithMetadata);
    const block: BlockResponse & { slot: number } = wumboBlockResp as any;
    const mapped: any = block.transactions.flatMap(txn => {
      const accounts = txn.transaction.message.accountKeys.map((key) => (
        // @ts-ignore
        new PublicKey(new BN(key._bn, 'hex'))
      ));

      return transformer.transform(accounts, txn)
    })[0];

    expect(mapped.accounts.initializeArgs.wumbo).to.eq("A9rpb17imqaHtcmhUWJB6iZxKmrQdXUgkq7SP6YZzQnk");
  })
})