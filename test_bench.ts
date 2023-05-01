import {
  Queue,
  QueueClosedError,
} from "https://deno.land/x/streamtools@v0.1.0/mod.ts";
import { assertEquals } from "https://deno.land/std@0.185.0/testing/asserts.ts";
import { assertNumber } from "https://deno.land/x/unknownutil@v2.1.0/assert.ts";
import { Session as SessionMsgpackRpc } from "https://deno.land/x/msgpack_rpc@v4.0.0/mod.ts";
import { Client, Session } from "./mod.ts";

function readerFromQueue(queue: Queue<Uint8Array>): Deno.Reader & Deno.Closer {
  return {
    async read(p: Uint8Array): Promise<number | null> {
      try {
        const chunk = await queue.dequeue();
        p.set(chunk);
        return chunk.length;
      } catch (err: unknown) {
        if (err instanceof QueueClosedError) {
          return null;
        }
        throw err;
      }
    },
    close() {
      queue.close();
    },
  };
}

function writerFromQueue(queue: Queue<Uint8Array>): Deno.Writer {
  return {
    write(p: Uint8Array): Promise<number> {
      queue.enqueue(p);
      return Promise.resolve(p.length);
    },
  };
}

Deno.bench("messagepack_rpc", { group: "bench", baseline: true }, async () => {
  const p2c = new Queue<Uint8Array>();
  const c2p = new Queue<Uint8Array>();

  const producer = async () => {
    const session = new Session(
      c2p.readable,
      p2c.writable,
    );
    const client = new Client(session);
    session.start();

    for (let i = 0; i < 1000; i++) {
      assertEquals(i + i, await client.request("sum", i, i));
    }
    p2c.close();
    c2p.close();
  };

  const consumer = async () => {
    const session = new Session(
      p2c.readable,
      c2p.writable,
    );
    session.dispatcher = {
      sum(x, y) {
        assertNumber(x);
        assertNumber(y);
        return x + y;
      },
    };
    await session.start();
  };

  await Promise.all([producer(), consumer()]);
});

Deno.bench("msgpack_rpc", { group: "bench", baseline: true }, async () => {
  const p2c = new Queue<Uint8Array>();
  const c2p = new Queue<Uint8Array>();

  const producer = async () => {
    const session = new SessionMsgpackRpc(
      readerFromQueue(c2p),
      writerFromQueue(p2c),
    );

    for (let i = 0; i < 1000; i++) {
      assertEquals(i + i, await session.call("sum", i, i));
    }
    p2c.close();
    c2p.close();
    session.close();
  };

  const consumer = async () => {
    const session = new SessionMsgpackRpc(
      readerFromQueue(p2c),
      writerFromQueue(c2p),
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

  await Promise.all([producer(), consumer()]);
});
