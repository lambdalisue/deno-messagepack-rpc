import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.186.0/testing/asserts.ts";
import { buildResponseMessage } from "./message.ts";
import { Client } from "./client.ts";

Deno.test("Client.call", async (t) => {
  await t.step("sends a request and waits for a response", async () => {
    const receives: unknown[] = [];
    const session = {
      send: (message: unknown) => {
        receives.push(message);
      },
      recv: (msgid: number) => {
        return Promise.resolve(
          buildResponseMessage(msgid, null, `response:${msgid}`),
        );
      },
    };
    const client = new Client(session);
    assertEquals(await client.call("foo", "bar"), "response:0");
    assertEquals(await client.call("foo", "bar"), "response:1");
    assertEquals(receives, [
      [0, 0, "foo", ["bar"]],
      [0, 1, "foo", ["bar"]],
    ]);
  });

  await t.step("throws an error when send fails", () => {
    const session = {
      send: () => {
        throw new Error("send error");
      },
      recv: (msgid: number) => {
        return Promise.resolve(
          buildResponseMessage(msgid, null, `response:${msgid}`),
        );
      },
    };
    const client = new Client(session);
    assertThrows(() => client.call("foo", "bar"), Error, "send error");
  });

  await t.step("rejects with an error when recv fails", async () => {
    const session = {
      send: () => {
        // Do NOTHING
      },
      recv: () => {
        throw new Error("recv error");
      },
    };
    const client = new Client(session);
    await assertRejects(() => client.call("foo", "bar"), Error, "recv error");
  });
});

Deno.test("Client.notify", async (t) => {
  await t.step("sends a request", () => {
    const receives: unknown[] = [];
    const session = {
      send: (message: unknown) => {
        receives.push(message);
      },
      recv: () => {
        throw new Error("should not be called");
      },
    };
    const client = new Client(session);
    client.notify("foo", "bar");
    client.notify("foo", "bar");
    assertEquals(receives, [
      [2, "foo", ["bar"]],
      [2, "foo", ["bar"]],
    ]);
  });

  await t.step("rejects with an error when send fails", () => {
    const session = {
      send: () => {
        throw new Error("send error");
      },
      recv: () => {
        throw new Error("should not be called");
      },
    };
    const client = new Client(session);
    assertThrows(() => client.notify("foo", "bar"), Error, "send error");
  });
});
