import { DispatcherFrom } from "./dispatcher.ts";

type A = {
  a: (a: number) => void;
  b: (a: number, b: string) => number;
};

const _: DispatcherFrom<A> = {
  a: (_: unknown): unknown => undefined,
  b: (_: unknown, __: unknown): unknown => 1,
};
