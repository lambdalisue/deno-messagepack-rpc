import * as unknownutil from "https://deno.land/x/unknownutil@v2.1.0/mod.ts";
import { Invoker, Session } from "../mod.ts";

async function main(): Promise<void> {
  const hostname = "localhost";
  const port = 18800;
  const conn = await Deno.connect({ hostname, port });
  const session = new Session(conn.readable, conn.writable);
  const invoker = new Invoker(session);
  session.dispatcher = {
    helloServer(name) {
      return invoker.request("helloServer", name);
    },

    helloClient(name) {
      unknownutil.assertString(name);
      return `Hello ${name}, this is client`;
    },
  };

  const controller = new AbortController();

  await Promise.all([
    session.start({ signal: controller.signal })
      .then(() => console.log("Session finished"))
      .catch((e) => {
        if (e.name !== "AbortError") {
          console.error(e);
        }
      }),
    (async () => {
      console.log(await invoker.request("sum", 1, 1));
      console.log(await invoker.request("helloServer", "Bob"));
      console.log(await invoker.request("helloClient", "Bob"));
      console.log(await invoker.request("helloClientServer", "Bob"));
      controller.abort();
    })(),
  ]);
}

main();
