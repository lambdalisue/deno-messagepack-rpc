import { assert, is } from "@core/unknownutil";
import { Client, Session } from "../mod.ts";

async function main(): Promise<void> {
  const hostname = "localhost";
  const port = 18800;
  const conn = await Deno.connect({ hostname, port });
  const session = new Session(conn.readable, conn.writable);
  const client = new Client(session);
  session.dispatcher = {
    helloServer(name) {
      return client.call("helloServer", name);
    },

    helloClient(name) {
      assert(name, is.String);
      return `Hello ${name}, this is client`;
    },
  };
  session.start();
  console.log(await client.call("sum", 1, 2));
  console.log(await client.call("helloServer", "Bob"));
  console.log(await client.call("helloClient", "Bob"));
  console.log(await client.call("helloClientServer", "Bob"));
  await session.shutdown();
}

main();
