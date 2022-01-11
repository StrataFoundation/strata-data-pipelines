export function groupByN<T>(n: number, data: T[]): T[][] {
  let result = [];
  for (let i = 0; i < data.length; i += n) result.push(data.slice(i, i + n));
  return result;
};

type PromFunc<A> = () => Promise<A>;
export async function promiseAllGrouped<A>(size: number, funcs: PromFunc<A>[]): Promise<A[]> {
  const results: A[] = [];
  const grouped = groupByN(size, funcs);
  for(let funcs of grouped) {
    await Promise.all(funcs.map(async func => {
      results.push(await func());      
    }))
  }

  return results;
}