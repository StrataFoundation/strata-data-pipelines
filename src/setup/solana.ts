import { Connection } from "@solana/web3.js";

export const connection = new Connection(process.env["SOLANA_URL"] || "https://wumbo.devnet.rpcpool.com/");
