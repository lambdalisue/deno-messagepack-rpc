import * as unknownutil from "https://deno.land/x/unknownutil@v2.1.1/mod.ts";
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
      unknownutil.assertNumber(x);
      unknownutil.assertNumber(y);
      return x + y;
    },

    helloServer(name) {
      unknownutil.assertString(name);
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
