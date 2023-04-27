import * as unknownutil from "https://deno.land/x/unknownutil@v2.1.0/mod.ts";
import { Invoker, Session } from "../mod.ts";

async function main(): Promise<void> {
  const hostname = "localhost";
  const port = 18800;
  const listener = Deno.listen({ hostname, port });
  const waiters: Promise<void>[] = [];
  for await (const conn of listener) {
    const session = new Session(conn.readable, conn.writable);
    const invoker = new Invoker(session);
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
        return invoker.request("helloClient", name);
      },

      helloClientServer(name) {
        return invoker.request("helloServer", name);
      },
    };
    waiters.push(
      session.start()
        .then(() => console.log("Session finished"))
        .catch((e) => console.error(e)),
    );
  }
  await Promise.all(waiters);
}

main();
