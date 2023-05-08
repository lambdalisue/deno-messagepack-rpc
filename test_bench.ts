import { deferred } from "https://deno.land/std@0.186.0/async/mod.ts";
import { Queue } from "https://deno.land/x/async@v2.0.2/mod.ts";
import { channel } from "https://deno.land/x/streamtools@v0.4.0/mod.ts";
import { assertEquals } from "https://deno.land/std@0.186.0/testing/asserts.ts";
import { assertNumber } from "https://deno.land/x/unknownutil@v2.1.1/assert.ts";
import { Session as SessionMsgpackRpc } from "https://deno.land/x/msgpack_rpc@v4.0.1/mod.ts";
import { Session } from "./mod.ts";

Deno.bench("messagepack_rpc", { group: "bench", baseline: true }, async () => {
  const s2c = channel<Uint8Array>();
  const c2s = channel<Uint8Array>();
  const guard = deferred();

  const server = async () => {
    const session = new Session(c2s.reader, s2c.writer);
    session.dispatcher = {
      sum(x, y) {
        assertNumber(x);
        assertNumber(y);
        return x + y;
      },
    };
    await session.start(async () => {
      await guard;
    });
  };

  const client = async () => {
    const session = new Session(s2c.reader, c2s.writer);
    await session.start(async (client) => {
      for (let i = 0; i < 1000; i++) {
        assertEquals(i + i, await client.request("sum", i, i));
      }
    });
    guard.resolve();
  };

  await Promise.all([server(), client()]);
});

Deno.bench("msgpack_rpc", { group: "bench", baseline: true }, async () => {
  const s2c = new Queue<Uint8Array>();
  const c2s = new Queue<Uint8Array>();
  const s2cReader = readerFromQueue(s2c);
  const s2cWriter = writerFromQueue(s2c);
  const c2sReader = readerFromQueue(c2s);
  const c2sWriter = writerFromQueue(c2s);

  const client = async () => {
    const session = new SessionMsgpackRpc(s2cReader, c2sWriter);
    for (let i = 0; i < 1000; i++) {
      assertEquals(i + i, await session.call("sum", i, i));
    }
    session.close();
    c2sReader.close();
  };

  const server = async () => {
    const session = new SessionMsgpackRpc(c2sReader, s2cWriter);
    session.dispatcher = {
      sum(x, y) {
        assertNumber(x);
        assertNumber(y);
        return Promise.resolve(x + y);
      },
    };
    await session.waitClosed();
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
