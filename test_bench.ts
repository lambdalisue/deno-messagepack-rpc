import { channel } from "@lambdalisue/streamtools";
import { assertEquals } from "@std/assert";
import { assert, is } from "@core/unknownutil";
import { Client, Session } from "./mod.ts";

Deno.bench("messagepack_rpc", { group: "bench", baseline: true }, async () => {
  const serverToClient = channel<Uint8Array>();
  const clientToServer = channel<Uint8Array>();
  const serverSession = new Session(
    clientToServer.reader,
    serverToClient.writer,
  );
  const clientSession = new Session(
    serverToClient.reader,
    clientToServer.writer,
  );
  const server = async () => {
    serverSession.dispatcher = {
      sum(x, y) {
        assert(x, is.Number);
        assert(y, is.Number);
        return x + y;
      },
    };
    serverSession.start();
    await serverSession.wait();
  };
  const client = async () => {
    const client = new Client(clientSession);
    clientSession.start();
    await Promise.all([...Array(1000)].map(async (_, i) => {
      assertEquals(i + i, await client.call("sum", i, i));
    }));
    await clientSession.shutdown();
    await serverSession.shutdown();
  };

  await Promise.all([server(), client()]);
});
