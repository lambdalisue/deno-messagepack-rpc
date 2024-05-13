import { assertEquals, assertRejects, unimplemented } from "@std/assert";
import {
  assertSpyCallArgs,
  assertSpyCalls,
  resolvesNext,
  stub,
} from "@std/testing/mock";
import { Indexer } from "@lambdalisue/indexer";
import { buildResponseMessage, type ResponseMessage } from "./message.ts";
import { Client } from "./client.ts";

type Session = ConstructorParameters<typeof Client>[0];

const session: Session = {
  send: () => unimplemented(),
  recv: () => unimplemented(),
};

Deno.test("Client.call", async (t) => {
  await t.step("sends a request and waits for a response", async () => {
    using send = stub(session, "send", resolvesNext([undefined, undefined]));
    using recv = stub(
      session,
      "recv",
      (msgid: number) =>
        Promise.resolve(buildResponseMessage(msgid, null, `response:${msgid}`)),
    );
    const client = new Client(session);

    assertEquals(await client.call("foo", "bar"), "response:0");
    assertSpyCalls(send, 1);
    assertSpyCallArgs(send, 0, [[0, 0, "foo", ["bar"]]]);
    assertSpyCalls(recv, 1);
    assertSpyCallArgs(recv, 0, [0]);

    assertEquals(await client.call("foo", "bar"), "response:1");
    assertSpyCalls(send, 2);
    assertSpyCallArgs(send, 1, [[0, 1, "foo", ["bar"]]]);
    assertSpyCalls(recv, 2);
    assertSpyCallArgs(recv, 1, [1]);
  });

  await t.step(
    "sends a request and waits for a response (multiple clients)",
    async () => {
      using send = stub(session, "send", resolvesNext([undefined, undefined]));
      using recv = stub(
        session,
        "recv",
        (msgid: number) =>
          Promise.resolve(
            buildResponseMessage(msgid, null, `response:${msgid}`),
          ),
      );
      const indexer = new Indexer();
      const client1 = new Client(session, { indexer });
      const client2 = new Client(session, { indexer });

      assertEquals(await client1.call("foo", "bar"), "response:0");
      assertSpyCalls(send, 1);
      assertSpyCallArgs(send, 0, [[0, 0, "foo", ["bar"]]]);
      assertSpyCalls(recv, 1);
      assertSpyCallArgs(recv, 0, [0]);

      assertEquals(await client2.call("foo", "bar"), "response:1");
      assertSpyCalls(send, 2);
      assertSpyCallArgs(send, 1, [[0, 1, "foo", ["bar"]]]);
      assertSpyCalls(recv, 2);
      assertSpyCallArgs(recv, 1, [1]);
    },
  );

  await t.step("rejects with an error when send fails", async () => {
    using send = stub(
      session,
      "send",
      resolvesNext<void>([new Error("send error")]),
    );
    using recv = stub(
      session,
      "recv",
      (msgid: number) =>
        Promise.resolve(buildResponseMessage(msgid, null, `response:${msgid}`)),
    );
    const client = new Client(session);
    await assertRejects(
      async () => {
        await client.call("foo", "bar");
      },
      Error,
      "send error",
    );
    assertSpyCalls(send, 1);
    assertSpyCalls(recv, 1);
  });

  await t.step("rejects with an error when recv fails", async () => {
    using send = stub(session, "send", resolvesNext([undefined]));
    using recv = stub(
      session,
      "recv",
      resolvesNext<ResponseMessage>([new Error("recv error")]),
    );
    const client = new Client(session);
    await assertRejects(
      async () => {
        await client.call("foo", "bar");
      },
      Error,
      "recv error",
    );
    assertSpyCalls(send, 1);
    assertSpyCalls(recv, 1);
  });
});

Deno.test("Client.notify", async (t) => {
  await t.step("sends a request", async () => {
    using send = stub(session, "send", resolvesNext([undefined, undefined]));
    const client = new Client(session);

    await client.notify("foo", "bar");
    assertSpyCalls(send, 1);
    assertSpyCallArgs(send, 0, [[2, "foo", ["bar"]]]);

    await client.notify("foo", "bar");
    assertSpyCalls(send, 2);
    assertSpyCallArgs(send, 1, [[2, "foo", ["bar"]]]);
  });

  await t.step("rejects with an error when send fails", async () => {
    using send = stub(
      session,
      "send",
      resolvesNext<void>([new Error("send error")]),
    );
    const client = new Client(session);
    await assertRejects(
      async () => {
        await client.notify("foo", "bar");
      },
      Error,
      "send error",
    );
    assertSpyCalls(send, 1);
  });
});
