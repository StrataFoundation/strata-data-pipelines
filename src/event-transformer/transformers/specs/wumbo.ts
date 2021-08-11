import { WUMBO_INSTRUCTION_SCHEMA, InitializeSocialTokenV0Args, InitializeWumboV0Args } from "spl-wumbo";

export default {
  programId: 'AiYPQudWgXerJ1BdKfH5HkEamnPXSHAfPK2ThhKFkkDw',
  schema: WUMBO_INSTRUCTION_SCHEMA,
  commands: [{
    name: "InitializeWumboV0",
    index: 0,
    accounts: [
      "payer",
      "wumboInstance",
      "wumMint",
      "baseCurve"
    ],
    args: InitializeWumboV0Args
  },{
    name: "InitializeSocialTokenV0",
    index: 1,
    accounts: [
      "payer",
      "tokenRef",
      "reverseTokenRef",
      "wumboInstance",
      "nameServiceName",
      "founderRewards",
      "tokenBonding"
    ],
    args: InitializeSocialTokenV0Args
  }]
}