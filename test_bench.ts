import { deferred } from "https://deno.land/std@0.186.0/async/mod.ts";
import { Queue } from "https://deno.land/x/async@v2.0.2/mod.ts";
import { channel } from "https://deno.land/x/streamtools@v0.4.1/mod.ts";
import { assertEquals } from "https://deno.land/std@0.186.0/testing/asserts.ts";
import { assertNumber } from "https://deno.land/x/unknownutil@v2.1.1/assert.ts";
import { Session as SessionMsgpackRpc } from "https://deno.land/x/msgpack_rpc@v4.0.1/mod.ts";
import { Client, Session } from "./mod.ts";

Deno.bench("messagepack_rpc", { group: "bench", baseline: true }, async () => {
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
  const server = async () => {
    serverSession.dispatcher = {
      sum(x, y) {
        assertNumber(x);
        assertNumber(y);
        return x + y;
      },
    };
    serverSession.start();
    await serverSession.wait();
  };
  const client = async () => {
    const client = new Client(clientSession);
    clientSession.start();
    await Promise.all([...Array(1000)].map(async (_, i) => {
      assertEquals(i + i, await client.call("sum", i, i));
    }));
    await clientSession.shutdown();
    await serverSession.shutdown();
  };

  await Promise.all([server(), client()]);
});

Deno.bench("msgpack_rpc", { group: "bench", baseline: true }, async () => {
  const serverToClient = new Queue<Uint8Array>();
  const clientToServer = new Queue<Uint8Array>();
  const serverToClientReader = readerFromQueue(serverToClient);
  const serverToClientWriter = writerFromQueue(serverToClient);
  const clientToServerReader = readerFromQueue(clientToServer);
  const clientToServerWriter = writerFromQueue(clientToServer);

  const server = async () => {
    const session = new SessionMsgpackRpc(
      clientToServerReader,
      serverToClientWriter,
    );
    session.dispatcher = {
      sum(x, y) {
        assertNumber(x);
        assertNumber(y);
        return Promise.resolve(x + y);
      },
    };
    await session.waitClosed();
  };
  const client = async () => {
    const session = new SessionMsgpackRpc(
      serverToClientReader,
      clientToServerWriter,
    );
    await Promise.all([...Array(1000)].map(async (_, i) => {
      assertEquals(i + i, await session.call("sum", i, i));
    }));
    session.close();
    clientToServerReader.close();
  };

  await Promise.all([server(), client()]);
});

function readerFromQueue(q: Queue<Uint8Array>): Deno.Reader & Deno.Closer {
  const closed = Symbol("closed");
  const waiter = deferred<typeof closed>();
  return {
    async read(p: Uint8Array): Promise<number | null> {
      const result = await Promise.race([q.pop(), waiter]);
      if (result === closed) {
        return null;
      }
      p.set(result);
      return result.length;
    },
    close() {
      waiter.resolve(closed);
    },
  };
}

function writerFromQueue(q: Queue<Uint8Array>): Deno.Writer {
  return {
    write(p: Uint8Array): Promise<number> {
      q.push(p);
      return Promise.resolve(p.length);
    },
  };
}
