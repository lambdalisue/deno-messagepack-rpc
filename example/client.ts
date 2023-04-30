import * as unknownutil from "https://deno.land/x/unknownutil@v2.1.0/mod.ts";
import { Client, Session } from "../mod.ts";

async function main(): Promise<void> {
  const hostname = "localhost";
  const port = 18800;
  const conn = await Deno.connect({ hostname, port });
  const session = new Session(conn.readable, conn.writable);
  const client = new Client(session);
  session.dispatcher = {
    helloServer(name) {
      return client.request("helloServer", name);
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
      console.log(await client.request("sum", 1, 1));
      console.log(await client.request("helloServer", "Bob"));
      console.log(await client.request("helloClient", "Bob"));
      console.log(await client.request("helloClientServer", "Bob"));
      controller.abort();
    })(),
  ]);
}

main();
