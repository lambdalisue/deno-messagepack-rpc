import {
  assert,
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.193.0/testing/asserts.ts";
import { channel } from "https://deno.land/x/streamtools@v0.5.0/mod.ts";
import { Session } from "./session.ts";
import { Client } from "./client.ts";

function createSessionPair(): [Session, Session] {
  const serverToClient = channel<Uint8Array>();
  const clientToServer = channel<Uint8Array>();
  const serverSession = new Session(
    clientToServer.reader,
    serverToClient.writer,
  );
  const clientSession = new Session(
    serverToClient.reader,
    clientToServer.writer,
  );
  return [serverSession, clientSession];
}

Deno.test("Integration tests", async (t) => {
  await t.step(
    "call the server method that return a result",
    async () => {
      const [serverSession, clientSession] = createSessionPair();
      const server = async () => {
        let called = false;
        serverSession.dispatcher = {
          sum(x, y) {
            called = true;
            assertEquals(x, 1);
            assertEquals(y, 2);
            return 3;
          },
        };
        serverSession.start();
        await serverSession.wait();
        assert(called, "sum is not called");
      };
      const client = async () => {
        const client = new Client(clientSession);
        clientSession.start();
        assertEquals(3, await client.call("sum", 1, 2));
        await clientSession.shutdown();
        await serverSession.shutdown();
      };

      await Promise.all([server(), client()]);
    },
  );

  await t.step(
    "call the server method that throws an error",
    async () => {
      const [serverSession, clientSession] = createSessionPair();
      const server = async () => {
        let called = false;
        serverSession.dispatcher = {
          sum() {
            called = true;
            throw new Error("This is error");
          },
        };
        serverSession.start();
        await serverSession.wait();
        assert(called, "sum is not called");
      };
      const client = async () => {
        const client = new Client(clientSession);
        clientSession.start();
        await assertRejects(() => client.call("sum", 1, 2));
        await clientSession.shutdown();
        await serverSession.shutdown();
      };

      await Promise.all([server(), client()]);
    },
  );

  await t.step(
    "call the server method that is not defined",
    async () => {
      const [serverSession, clientSession] = createSessionPair();
      const server = async () => {
        serverSession.start();
        await serverSession.wait();
      };
      const client = async () => {
        const client = new Client(clientSession);
        clientSession.start();
        await assertRejects(() => client.call("sum", 1, 2));
        await clientSession.forceShutdown();
        await serverSession.forceShutdown();
      };

      await Promise.all([server(), client()]);
    },
  );

  await t.step(
    "call the server method that calls the client method",
    async () => {
      const [serverSession, clientSession] = createSessionPair();
      const server = async () => {
        const client = new Client(serverSession);
        let called = false;
        serverSession.dispatcher = {
          sum(x, y) {
            called = true;
            return client.call("sum", x, y);
          },
        };
        serverSession.start();
        await serverSession.wait();
        assert(called, "sum is not called");
      };
      const client = async () => {
        const client = new Client(clientSession);
        let called = false;
        clientSession.dispatcher = {
          sum(x, y) {
            called = true;
            assertEquals(x, 1);
            assertEquals(y, 2);
            return 3;
          },
        };
        clientSession.start();
        assertEquals(3, await client.call("sum", 1, 2));
        await clientSession.shutdown();
        await serverSession.shutdown();
        assert(called, "sum is not called");
      };

      await Promise.all([server(), client()]);
    },
  );

  await t.step(
    "notify the server method that return a result",
    async () => {
      const [serverSession, clientSession] = createSessionPair();
      const server = async () => {
        let called = false;
        serverSession.dispatcher = {
          sum(x, y) {
            called = true;
            assertEquals(x, 1);
            assertEquals(y, 2);
            return 3;
          },
        };
        serverSession.start();
        await serverSession.wait();
        assert(called, "sum is not called");
      };
      const client = async () => {
        const client = new Client(clientSession);
        clientSession.start();
        client.notify("sum", 1, 2);
        await clientSession.shutdown();
        await serverSession.shutdown();
      };

      await Promise.all([server(), client()]);
    },
  );

  await t.step(
    "notify the server method that throws an error",
    async () => {
      const [serverSession, clientSession] = createSessionPair();
      const server = async () => {
        let called = false;
        serverSession.dispatcher = {
          sum() {
            called = true;
            throw new Error("This is error");
          },
        };
        serverSession.start();
        await serverSession.wait();
        assert(called, "sum is not called");
      };
      const client = async () => {
        const client = new Client(clientSession);
        clientSession.start();
        client.notify("sum", 1, 2);
        await clientSession.shutdown();
        await serverSession.shutdown();
      };

      await Promise.all([server(), client()]);
    },
  );

  await t.step(
    "notify the server method that is not defined",
    async () => {
      const [serverSession, clientSession] = createSessionPair();
      const server = async () => {
        serverSession.start();
        await serverSession.wait();
      };
      const client = async () => {
        const client = new Client(clientSession);
        clientSession.start();
        client.notify("sum", 1, 2);
        await clientSession.shutdown();
        await serverSession.shutdown();
      };

      await Promise.all([server(), client()]);
    },
  );
});
