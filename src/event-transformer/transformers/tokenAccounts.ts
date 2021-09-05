import { PublicKey, TokenBalance } from "@solana/web3.js";
import { BlockTransaction, Transformer } from "./Transformer";
import BN from "bn.js";

// Zip two arrays by some key. Output array of length 2 arrays that are each object with its pair (or undefined)
function zipBy<A, B>(a: A[], b: A[], getKey: (a: A) => B): (A | undefined)[][] { 
  const keys = new Set([...a, ...b].map(getKey));
  const aMap = a.reduce((acc, a) => {
    acc.set(getKey(a), a)
    return acc;
  }, new Map());
  const bMap = b.reduce((acc, b) => {
    acc.set(getKey(b), b)
    return acc;
  }, new Map());
  return [...keys].map(key => [aMap.get(key), bMap.get(key)])
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
    const zipped = zipBy(preBalances || [], postBalances || [], i => i.pubkey.toBase58())
    const rawEvents = zipped.map(([preItem = emptyItem, postItem = emptyItem]) => {
      return {
        type: "TokenAccountBalanceChange",
        // @ts-ignore
        pubkey: new PublicKey(new BN((preItem.pubkey || postItem.pubkey)!._bn, 'hex')).toBase58(),
        preAmount: preItem.amount || 0,
        mint: preItem.mint || postItem.mint,
        postAmount: postItem.amount,
        decimals: preItem.decimals || postItem.decimals
      }
    })

    // Only publish when things change
    return rawEvents.filter((i: any) => (i.preAmount !== i.postAmount))
  }
}
