import { PublicKey, TokenBalance } from "@solana/web3.js";
import { BlockTransaction, Transformer } from "./Transformer";
import BN from "bn.js";

function zip<A>(a: A[], b: A[]): A[][] { 
  return Array.from(Array(Math.max(b.length, a.length)), (_, i) => [a[i], b[i]])
}

export default class TokenAccountTransformer implements Transformer {
  get relevantKeys(): Set<string> {
    return new Set(["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"])
  }

  transform(accountKeys: PublicKey[], transaction: BlockTransaction): any[] {
    function toPubkeyAmount({ accountIndex, mint, uiTokenAmount: { decimals, amount } }: TokenBalance) {
      return {
        mint,
        pubkey: accountKeys[accountIndex],
        amount,
        decimals
      }
    };
    const preBalances = transaction.meta?.preTokenBalances?.map(toPubkeyAmount);
    const postBalances = transaction.meta?.postTokenBalances?.map(toPubkeyAmount);
    const emptyItem = { pubkey: null, amount: null, mint: null, decimals: null }
    return zip(preBalances || [], postBalances || []).map(([preItem = emptyItem, postItem = emptyItem]) => {
      return {
        type: "TokenAccountBalanceChange",
        // @ts-ignore
        pubkey: new PublicKey(new BN((preItem.pubkey || postItem.pubkey)!._bn, 'hex')).toBase58(),
        preAmount: preItem.amount || postItem.amount,
        mint: preItem.mint || postItem.mint,
        postAmount: postItem.amount,
        decimals: preItem.decimals || postItem.decimals
      }
    })
      .filter((i: any) => i.preAmount !== i.postAmount)
  }
}
