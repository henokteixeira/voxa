/**
 * A value as the web app receives it: what `JSON.stringify` makes of `T`. Dates become ISO 8601 strings; a function
 * (or a bigint, which it cannot send) becomes `never`, so an answer that holds one fails the contract check.
 */
export type Json<T> = T extends Date
  ? string
  : T extends ((...args: never[]) => unknown) | bigint | symbol
    ? never
    : T extends readonly (infer Item)[]
      ? Json<Item>[]
      : T extends object
        ? { [Key in keyof T]: Json<T[Key]> }
        : T;
