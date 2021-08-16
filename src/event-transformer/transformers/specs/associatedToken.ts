import { PublicKey } from "@solana/web3.js";

export default {
  programId: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  commands: [{
    name: "InitializeAssociatedTokenAccount",
    index: 0,
    accounts: [
      "signer",
      "account",
      "owner",
      "mint"
    ]
  }]
}
