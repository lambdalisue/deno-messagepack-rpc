import { assert, is } from "https://deno.land/x/unknownutil@v3.2.0/mod.ts";
import { Client, Session } from "../mod.ts";

async function main(): Promise<void> {
  const hostname = "localhost";
  const port = 18800;
  const listener = Deno.listen({ hostname, port });
  const waiters: Promise<void>[] = [];
  for await (const conn of listener) {
    startSession(conn)
      .then(() => console.log("Session finished"))
      .catch((e) => console.error(e));
  }
  await Promise.all(waiters);
}

async function startSession(conn: Deno.Conn): Promise<void> {
  const session = new Session(conn.readable, conn.writable);
  const client = new Client(session);
  session.dispatcher = {
    sum(x, y) {
      assert(x, is.Number);
      assert(y, is.Number);
      return x + y;
    },

    helloServer(name) {
      assert(name, is.String);
      return `Hello ${name}, this is server`;
    },

    helloClient(name) {
      return client.call("helloClient", name);
    },

    helloClientServer(name) {
      return client.call("helloServer", name);
    },
  };
  session.start();
  await session.wait();
}

main();
