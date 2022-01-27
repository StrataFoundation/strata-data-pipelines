import { PublicKey, TokenBalance, TransactionResponse } from "@solana/web3.js";
import { Transformer } from "./Transformer";

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

type PubkeyAmount = { mint: string, amount: string, pubkey: PublicKey, decimals: number };

function groupByPubkey(acc: Record<string, PubkeyAmount>, record: PubkeyAmount): Record<string, PubkeyAmount> {
  acc[record.pubkey.toBase58()] = record;

  return acc;
}

export default class TokenAccountTransformer implements Transformer {
  get relevantKeys(): Set<string> {
    return new Set(["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"])
  }

  transform(accountKeys: PublicKey[], transaction: TransactionResponse & { signature: string }): any[] {
    function toPubkeyAmount({ accountIndex, mint, uiTokenAmount: { decimals, amount } }: TokenBalance): PubkeyAmount {
      return {
        mint,
        pubkey: accountKeys[accountIndex],
        amount,
        decimals
      }
    };
    const preBalances = transaction.meta?.preTokenBalances?.map(toPubkeyAmount)?.reduce(groupByPubkey, {} as Record<string, PubkeyAmount>);
    const postBalances = transaction.meta?.postTokenBalances?.map(toPubkeyAmount)?.reduce(groupByPubkey, {} as Record<string, PubkeyAmount>);
    const keys = new Set([...Object.keys(preBalances || {}), ...Object.keys(postBalances || {})])
    const emptyItem = { pubkey: null, amount: null, mint: null, decimals: null }
    const rawEvents = [...keys].map((key) => {
      const preItem = (preBalances && preBalances[key]) || emptyItem;
      const postItem = (postBalances && postBalances[key]) || emptyItem;
      return {
        type: "TokenAccountBalanceChange",
        // @ts-ignore
        pubkey: (preItem.pubkey || postItem.pubkey).toBase58(),
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
