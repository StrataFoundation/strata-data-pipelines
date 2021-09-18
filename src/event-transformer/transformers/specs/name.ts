import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

export class CreateArgs {
  instruction: number = 0;
  hashedName: Buffer;
  lamports: BN;
  space: number;

  constructor(args: { hashedName: Buffer, lamports: BN, space: number}) {
    this.hashedName = args.hashedName;
    this.lamports = args.lamports;
    this.space = args.space;
  }
}

export class UpdateArgs {
  instruction: number = 1;
  offset: number;
  data: Buffer;

  constructor(args: { offset: number, data: Buffer }) {
    this.offset = args.offset;
    this.data = args.data;
  }
}

export class TransferArgs{
  instruction: number = 2;
  newOwner: PublicKey;

  constructor(args: { newOwner: PublicKey  }) {
    this.newOwner = args.newOwner;
  }
}

export class DeleteArgs {
  instruction: number = 3;
}

export default {
  programId: "namesLPneVptA9Z5rqUDD9tMTWEJwofgaYwp8cawRkX",
  schema:  new Map<any, any>([
    [
      CreateArgs,
      {
        kind: 'struct',
        fields: [
          ['instruction', 'u8'],
          ['hashedName', 'pubkey'],
          ['lamports', 'u64'],
          ['space', 'u32'],
        ],
      },
    ],
    [
      UpdateArgs,
      {
        kind: 'struct',
        fields: [
          ['instruction', 'u8'],
          ['offset', 'u32'],
          ['data', ['u8']],
        ],
      },
    ],
    [
      TransferArgs,
      {
        kind: 'struct',
        fields: [
          ['instruction', 'u8'],
          ['newOwner', 'pubkey'],
        ],
      },
    ],
    [
      DeleteArgs,
      {
        kind: 'struct',
        fields: [
          ['instruction', 'u8'],
        ],
      },
    ]
  ]),
  commands: [{
    name: "CreateNameServiceName",
    index: 0,
    accounts: [
      "systemProgram",
      "payer",
      "name",
      "owner",
      "class",
      "parent",
      "parentOwner",
    ],
    args: CreateArgs
  },{
    name: "UpdateNameServiceName",
    index: 1,
    accounts: [
      "name",
      "ownerOrClass",
    ],
    args: UpdateArgs
  },{
    name: "TransferNameServiceName",
    index: 2,
    accounts: [
      "name",
      "owner",
      "class",
    ],
    args: TransferArgs
  },{
    name: "DeleteNameServiceName",
    index: 3,
    accounts: [
      "name",
      "owner",
      "refund",
    ],
    args: DeleteArgs
  }]
}
