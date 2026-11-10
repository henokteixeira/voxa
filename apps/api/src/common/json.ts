/** A value as the web app receives it: what `JSON.stringify` makes of `T` (dates become ISO 8601 strings). */
export type Json<T> = T extends Date
  ? string
  : T extends readonly (infer Item)[]
    ? Json<Item>[]
    : T extends object
      ? { [Key in keyof T]: Json<T[Key]> }
      : T;
