import { PublicKey } from "@solana/web3.js";

export class InitializeAccountArgs {
  instruction: number = 1;
}

export class SetAuthorityArgs {
  instruction: number = 1;
  authorityType: number;
  newAuthority: PublicKey | undefined;

  constructor(args: { newAuthority: PublicKey | undefined, authorityType: number }) {
    this.newAuthority = args.newAuthority;
    this.authorityType = args.authorityType;
  }
}

export default {
  programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  schema:  new Map<any, any>([
    [
      InitializeAccountArgs,
      {
        kind: 'struct',
        fields: [
          ['instruction', 'u8'],
        ],
      },
    ],
    [
      SetAuthorityArgs,
      {
        kind: 'struct',
        fields: [
          ['instruction', 'u8'],
          ['authorityType', 'u8'],
          ['newAuthority', { kind: 'option', type: 'pubkey' }],
        ],
      },
    ],
  ]),
  commands: [{
    name: "InitializeTokenAccount",
    index: 1,
    accounts: [
      "account",
      "mint",
      "owner"
    ],
    args: InitializeAccountArgs
  },{
    name: "TokenProgramSetAuthority",
    index: 6,
    accounts: [
      "mintOrAccount",
      "signer1",
    ],
    args: SetAuthorityArgs
  }]
}
