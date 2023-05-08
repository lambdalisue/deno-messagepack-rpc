import {
  assert,
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.186.0/testing/asserts.ts";
import { deferred, delay } from "https://deno.land/std@0.186.0/async/mod.ts";
import { channel } from "https://deno.land/x/streamtools@v0.4.0/mod.ts";
import { Session } from "./session.ts";

Deno.test("Session", async (t) => {
  await t.step(
    "client requests a server method and receives the result as a response",
    async () => {
      const s2c = channel<Uint8Array>();
      const c2s = channel<Uint8Array>();
      const guard = deferred();

      const server = async () => {
        let called = false;
        const session = new Session(s2c.reader, c2s.writer);
        session.dispatcher = {
          sum(x, y) {
            called = true;
            assertEquals(x, 1);
            assertEquals(y, 2);
            return 3;
          },
        };
        await session.start(async () => {
          await guard;
        });
        assert(called, "sum is not called");
      };

      const client = async () => {
        const session = new Session(c2s.reader, s2c.writer);
        await session.start(async (client) => {
          assertEquals(3, await client.request("sum", 1, 2));
        });
        guard.resolve();
      };

      await Promise.all([server(), client()]);
    },
  );

  await t.step(
    "client requests a server method and receives the error as a response",
    async () => {
      const s2c = channel<Uint8Array>();
      const c2s = channel<Uint8Array>();
      const guard = deferred();

      const server = async () => {
        let called = false;
        const session = new Session(s2c.reader, c2s.writer);
        session.dispatcher = {
          sum() {
            called = true;
            throw new Error("This is error");
          },
        };
        await session.start(async () => {
          await guard;
        });
        assert(called, "sum is not called");
      };

      const client = async () => {
        const session = new Session(c2s.reader, s2c.writer);
        await session.start(async (client) => {
          await assertRejects(() => client.request("sum", 1, 2), Error);
        });
        guard.resolve();
      };

      await Promise.all([server(), client()]);
    },
  );

  await t.step(
    "client requests a server method and receives the not found error as a response",
    async () => {
      const s2c = channel<Uint8Array>();
      const c2s = channel<Uint8Array>();
      const guard = deferred();

      const server = async () => {
        const session = new Session(s2c.reader, c2s.writer);
        await session.start(async () => {
          await guard;
        });
      };

      const client = async () => {
        const session = new Session(c2s.reader, s2c.writer);
        await session.start(async (client) => {
          await assertRejects(() => client.request("sum", 1, 2), Error);
        });
        guard.resolve();
      };

      await Promise.all([server(), client()]);
    },
  );

  await t.step(
    "client notifies a server method",
    async () => {
      const s2c = channel<Uint8Array>();
      const c2s = channel<Uint8Array>();
      const guard = deferred();

      const server = async () => {
        let called = false;
        const session = new Session(s2c.reader, c2s.writer);
        session.dispatcher = {
          sum(x, y) {
            called = true;
            assertEquals(x, 1);
            assertEquals(y, 2);
            return 3;
          },
        };
        await session.start(async () => {
          await guard;
        });
        assert(called, "sum is not called");
      };

      const client = async () => {
        const session = new Session(c2s.reader, s2c.writer);
        await session.start(async (client) => {
          client.notify("sum", 1, 2);
          // Wait until notification is processed
          await delay(0);
        });
        guard.resolve();
      };

      await Promise.all([server(), client()]);
    },
  );

  await t.step(
    "client requests a server method that requests a client method and receives the result as a response",
    async () => {
      const s2c = channel<Uint8Array>();
      const c2s = channel<Uint8Array>();
      const guard = deferred();

      const server = async () => {
        let called = false;
        const session = new Session(s2c.reader, c2s.writer);
        await session.start(async (client) => {
          session.dispatcher = {
            sum(x, y) {
              called = true;
              return client.request("sum", x, y);
            },
          };
          await guard;
        });
        assert(called, "sum is not called");
      };

      const client = async () => {
        let called = false;
        const session = new Session(c2s.reader, s2c.writer);
        await session.start(async (client) => {
          session.dispatcher = {
            sum(x, y) {
              called = true;
              assertEquals(x, 1);
              assertEquals(y, 2);
              return 3;
            },
          };
          assertEquals(3, await client.request("sum", 1, 2));
        });
        guard.resolve();
        assert(called, "sum is not called");
      };

      await Promise.all([server(), client()]);
    },
  );
});
