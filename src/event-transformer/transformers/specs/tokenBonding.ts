import { TOKEN_BONDING_INSTRUCTION_SCHEMA, InitializeTokenBondingV0Args, BuyV0Args, SellV0Args, CreateLogCurveV0Args } from "@wum.bo/spl-token-bonding";

export default {
  programId: process.env["TOKEN_BONDING_PROGRAM_ID"]!,
  schema: TOKEN_BONDING_INSTRUCTION_SCHEMA,
  commands: [{
    name: "CreateLogCurveV0",
    index: 0,
    accounts: [
      "payer",
      "curve"
    ],
    args: CreateLogCurveV0Args
  }, {
    name: "InitializeTokenBondingV0",
    index: 1,
    accounts: [
      "payer",
      "tokenBonding",
      "curve",
      "baseMint",
      "targetMint",
      "founderRewards",
      "baseStorage",
      "baseStorageAuthority",
      "tokenProgramId"
    ],
    args: InitializeTokenBondingV0Args
  },{
    name: "BuyTokenBondingV0",
    index: 2,
    accounts: [
      "tokenBonding",
      "curve",
      "baseMint",
      "targetMint",
      "targetMintAuthority",
      "founderRewards",
      "baseStorage",
      "purchaseAccount",
      "purchaseAuthority",
      "destination",
      "tokenProgramId"
    ],
    args: BuyV0Args
  }, {
    name: "SellTokenBondingV0",
    index: 3,
    accounts: [
      "tokenBonding",
      "curve",
      "baseMint",
      "targetMint",
      "baseStorage",
      "baseStorageAuthority",
      "sellAccount",
      "sellAuthority",
      "destination",
      "tokenProgramId"
    ],
    args: SellV0Args
  }]
}
