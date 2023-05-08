import * as unknownutil from "https://deno.land/x/unknownutil@v2.1.1/mod.ts";
import { Session } from "../mod.ts";

async function main(): Promise<void> {
  const hostname = "localhost";
  const port = 18800;
  const conn = await Deno.connect({ hostname, port });
  const session = new Session(conn.readable, conn.writable);
  await session.start(async (client) => {
    session.dispatcher = {
      helloServer(name) {
        return client.request("helloServer", name);
      },

      helloClient(name) {
        unknownutil.assertString(name);
        return `Hello ${name}, this is client`;
      },
    };
    console.log(await client.request("sum", 1, 2));
    console.log(await client.request("helloServer", "Bob"));
    console.log(await client.request("helloClient", "Bob"));
    console.log(await client.request("helloClientServer", "Bob"));
  });
}

main();
