# messagepack-rpc

[![deno land](http://img.shields.io/badge/available%20on-deno.land/x-lightgrey.svg?logo=deno)](https://deno.land/x/messagepack_rpc)
[![deno doc](https://doc.deno.land/badge.svg)](https://doc.deno.land/https/deno.land/x/messagepack_rpc/mod.ts)
[![Test](https://github.com/lambdalisue/deno-messagepack-rpc/workflows/Test/badge.svg)](https://github.com/lambdalisue/deno-messagepack-rpc/actions?query=workflow%3ATest)

This is a [Deno][deno] module that allows for the implementation of
[MessagePack-RPC][MessagePack-RPC] using [MessagePack][messagepack] as the
message schema.

[deno]: https://deno.land/
[messagepack]: https://github.com/messagepack/messagepack/blob/master/spec.md
[messagepack-rpc]: https://github.com/msgpack-rpc/msgpack-rpc

## Usage

To create a MessagePack-RPC session, use the `Session` class with a
`ReadableStream<Uint8Array>` and `WritableStream<Uint8Array>` as shown below:

```ts
import { Session } from "https://deno.land/x/messagepack_rpc/mod.ts";

const hostname = "localhost";
const port = 18800;
const listener = Deno.Listen({ hostname, port });
for await (const conn of listener) {
  const session = new Session(conn.readable, conn.writable);
  // Define MessagePack-RPC methods
  session.dispatcher = {
    sum(x: unknown, y: unknown): unknown {
      return x + y;
    },
  };
  await session.start();
}
```

To request or notify a MessagePack-RPC operation, use the `Client` class with a
`Session` instance as shown below:

```ts
const client = new Client(session);
console.log(await client.request("sum", 1, 2));
// Output: 3
```

You can find complete examples in the [`./example`](./example) directory.

## License

The code is released under the MIT license, which is included in the
[LICENSE](./LICENSE) file. By contributing to this repository, contributors
agree to follow the license for any modifications made.
