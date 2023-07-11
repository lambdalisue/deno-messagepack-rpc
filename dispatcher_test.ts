import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.193.0/testing/asserts.ts";
import { dispatch, DispatcherFrom } from "./dispatcher.ts";

type A = {
  a: (a: number) => void;
  b: (a: number, b: string) => number;
};

const _: DispatcherFrom<A> = {
  a: (_: unknown): unknown => undefined,
  b: (_: unknown, __: unknown): unknown => 1,
};

Deno.test("dispatch", async (t) => {
  await t.step("dispatches a method", async () => {
    const dispatcher = {
      foo: () => "foo",
    };
    assertEquals(await dispatch(dispatcher, "foo", []), "foo");
  });

  await t.step("dispatches a method with arguments", async () => {
    const dispatcher = {
      foo: (a: unknown, b: unknown) => `foo:${a}:${b}`,
    };
    assertEquals(await dispatch(dispatcher, "foo", [1, "bar"]), "foo:1:bar");
  });

  await t.step(
    "rejects with an error when the method does not exist in the dispatcher",
    async () => {
      const dispatcher = {};
      await assertRejects(
        () => dispatch(dispatcher, "foo", []),
        Error,
        "No MessagePack-RPC method",
      );
    },
  );
});
