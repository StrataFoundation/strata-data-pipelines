export class LRU<A, B> {
  max: number;
  cache: Map<A, B>;

  constructor(max = 10) {
      this.max = max;
      this.cache = new Map();
  }

  get(key: A): B | undefined {
      let item = this.cache.get(key);
      if (item) {
          // refresh key
          this.cache.delete(key);
          this.cache.set(key, item);
      }
      return item;
  }

  set(key: A, val: B) {
      // refresh key
      if (this.cache.has(key)) this.cache.delete(key);
      // evict oldest
      else if (this.cache.size == this.max) this.cache.delete(this.first());
      this.cache.set(key, val);
  }

  first() {
      return this.cache.keys().next().value;
  }
}
