import {
  assert,
  assertEquals,
  AssertionError,
  assertIsError,
  assertRejects,
  assertThrows,
} from "@std/assert";
import {
  assertSpyCallArgs,
  assertSpyCalls,
  resolvesNext,
  returnsNext,
  spy,
  stub,
} from "@std/testing/mock";
import { promiseState } from "@lambdalisue/async";
import { decode, encode } from "@lambdalisue/messagepack";
import {
  type Channel,
  channel,
  collect,
  pop,
  push,
} from "@lambdalisue/streamtools";
import { AlreadyReservedError } from "@lambdalisue/reservator";
import {
  buildNotificationMessage,
  buildRequestMessage,
  buildResponseMessage,
} from "./message.ts";
import { Session } from "./session.ts";

function createDummySession(): {
  input: Channel<Uint8Array>;
  output: Channel<Uint8Array>;
  session: Session;
} {
  const input = channel<Uint8Array>();
  const output = channel<Uint8Array>();
  const session = new Session(input.reader, output.writer);
  return { input, output, session };
}

function ensureNotNull<T>(value: T | null): T {
  if (value === null) {
    throw new AssertionError("value must not be null");
  }
  return value;
}

Deno.test("Session.send", async (t) => {
  await t.step(
    "rejects an error if the session is not started",
    async () => {
      const { session } = createDummySession();

      const message = buildRequestMessage(1, "sum", [1, 2]);
      await assertRejects(
        () => session.send(message),
        Error,
        "Session is not running",
      );
    },
  );

  await t.step(
    "sends a message to the specified writer",
    async () => {
      const { session, output } = createDummySession();

      session.start();

      const message = buildRequestMessage(1, "sum", [1, 2]);
      await session.send(message);
      assertEquals(
        decode(ensureNotNull(await pop(output.reader))),
        message,
      );
    },
  );
});

Deno.test("Session.recv", async (t) => {
  await t.step(
    "rejects an error if the session is not started",
    async () => {
      const { session } = createDummySession();

      await assertRejects(
        () => session.recv(1),
        Error,
        "Session is not running",
      );
    },
  );

  await t.step(
    "rejects an error if the message ID is already reserved",
    async () => {
      const { session } = createDummySession();

      session.start();
      session.recv(-1);

      await assertRejects(
        () => session.recv(-1),
        AlreadyReservedError,
      );
    },
  );

  await t.step(
    "waits a corresponding response message and resolves with it",
    async () => {
      const { session, input } = createDummySession();

      session.start();

      const message = buildResponseMessage(1, null, 3);
      push(input.writer, encode(message));
      assertEquals(
        await session.recv(1),
        message,
      );
    },
  );
});

Deno.test("Session.start", async (t) => {
  await t.step(
    "throws an error if the session is already started",
    () => {
      const { session } = createDummySession();

      session.start();
      assertThrows(() => session.start(), Error, "Session is already running");
    },
  );

  await t.step(
    "locks specified reader and writer",
    () => {
      const { session, input, output } = createDummySession();

      session.start();
      assert(input.reader.locked, "reader is not locked");
      assert(output.writer.locked, "writer is not locked");
    },
  );

  await t.step(
    "invokes a method defined in `dispatcher` and send-back a response message when a request message is received",
    async () => {
      const { session, input, output } = createDummySession();
      const sum = spy(returnsNext([3]));
      session.dispatcher = { sum };
      session.start();

      await push(input.writer, encode(buildRequestMessage(1, "sum", [1, 2])));
      await session.shutdown();
      assertSpyCalls(sum, 1);
      assertSpyCallArgs(sum, 0, [1, 2]);
      assertEquals(await collect(output.reader), [
        encode(buildResponseMessage(1, null, 3)),
      ]);
    },
  );

  await t.step(
    "invokes a method defined in `dispatcher` and send-back a response message when a request message is received (error)",
    async () => {
      const { session, input, output } = createDummySession();
      const sum = spy(() => {
        throw "sum error";
      });
      session.dispatcher = { sum };
      session.start();

      await push(input.writer, encode(buildRequestMessage(1, "sum", [1, 2])));
      await session.shutdown();
      assertSpyCalls(sum, 1);
      assertSpyCallArgs(sum, 0, [1, 2]);
      assertEquals(await collect(output.reader), [
        encode(
          buildResponseMessage(1, "sum error", null),
        ),
      ]);
    },
  );

  await t.step(
    "invokes a method defined in `dispatcher` when a notification message is received",
    async () => {
      const { session, input, output } = createDummySession();
      const sum = spy(returnsNext([3]));
      session.dispatcher = { sum };
      session.start();

      await push(input.writer, encode(buildNotificationMessage("sum", [1, 2])));
      await session.shutdown();
      assertSpyCalls(sum, 1);
      assertSpyCallArgs(sum, 0, [1, 2]);
      assertEquals(await collect(output.reader), []);
    },
  );

  await t.step(
    "invokes a method defined in `dispatcher` when a notification message is received (error)",
    async () => {
      const { session, input, output } = createDummySession();
      const sum = spy(() => {
        throw "sum error";
      });
      session.dispatcher = { sum };
      session.start();

      await push(input.writer, encode(buildNotificationMessage("sum", [1, 2])));
      await session.shutdown();
      assertSpyCalls(sum, 1);
      assertSpyCallArgs(sum, 0, [1, 2]);
      assertEquals(await collect(output.reader), []);
    },
  );
});

Deno.test("Session.wait", async (t) => {
  await t.step(
    "rejects an error if the session is not started",
    async () => {
      const { session } = createDummySession();

      await assertRejects(
        () => session.wait(),
        Error,
        "Session is not running",
      );
    },
  );

  await t.step(
    "returns a promise that is resolved when the session is closed (reader is closed)",
    async () => {
      const output = channel<Uint8Array>();
      const { promise, resolve } = Promise.withResolvers<void>();
      const session = new Session(
        // Reader that is not closed until the guard is resolved
        new ReadableStream({
          async start(controller) {
            await promise;
            controller.close();
          },
        }),
        output.writer,
      );

      session.start();

      const waiter = session.wait();
      assertEquals(await promiseState(waiter), "pending");
      resolve();
      assertEquals(await promiseState(waiter), "fulfilled");
    },
  );
});

Deno.test("Session.shutdown", async (t) => {
  await t.step(
    "rejects an error if the session is not started",
    async () => {
      const { session } = createDummySession();

      await assertRejects(
        () => session.shutdown(),
        Error,
        "Session is not running",
      );
    },
  );

  await t.step(
    "unlocks specified reader and writer",
    async () => {
      const { session, input, output } = createDummySession();

      session.start();
      await session.shutdown();
      assert(!input.reader.locked, "reader is locked");
      assert(!output.writer.locked, "writer is locked");
    },
  );

  await t.step(
    "waits until all messages are processed to the writer",
    async () => {
      const input = channel<Uint8Array>();
      const { promise, resolve } = Promise.withResolvers<void>();
      const session = new Session(
        input.reader,
        // Writer that is not processed until the guard is resolved
        new WritableStream({
          async write() {
            await promise;
          },
        }),
      );

      session.start();
      await session.send(buildRequestMessage(1, "sum", [1, 2]));
      const shutdown = session.shutdown();
      assertEquals(await promiseState(shutdown), "pending");
      // Process all messages
      resolve();
      assertEquals(await promiseState(shutdown), "fulfilled");
    },
  );
});

Deno.test("Session.forceShutdown", async (t) => {
  await t.step(
    "rejects an error if the session is not started",
    async () => {
      const { session } = createDummySession();

      await assertRejects(
        () => session.forceShutdown(),
        Error,
        "Session is not running",
      );
    },
  );

  await t.step(
    "unlocks specified reader and writer",
    async () => {
      const { session, input, output } = createDummySession();

      session.start();
      await session.forceShutdown();
      assert(!input.reader.locked, "reader is locked");
      assert(!output.writer.locked, "writer is locked");
    },
  );

  await t.step(
    "does not wait until all messages are processed to the writer",
    async () => {
      const input = channel<Uint8Array>();
      const { promise, resolve } = Promise.withResolvers<void>();
      const session = new Session(
        input.reader,
        // Writer that is not processed until the guard is resolved
        new WritableStream({
          async write() {
            await promise;
          },
        }),
      );

      session.start();
      session.send(buildRequestMessage(1, "sum", [1, 2]));
      const shutdown = session.forceShutdown();
      assertEquals(await promiseState(shutdown), "fulfilled");
      resolve();
    },
  );
});

Deno.test("Session.onInvalidMessage", async (t) => {
  await t.step(
    "is called when an invalid message is received",
    async () => {
      const { session, input } = createDummySession();
      const onInvalidMessage = spy(returnsNext([void 0]));
      session.onInvalidMessage = onInvalidMessage;
      session.start();

      await push(input.writer, encode("invalid"));
      await session.shutdown();
      assertSpyCalls(onInvalidMessage, 1);
      assertSpyCallArgs(onInvalidMessage, 0, ["invalid"]);
    },
  );

  await t.step(
    "is called when an invalid message is received (array)",
    async () => {
      const { session, input } = createDummySession();
      const onInvalidMessage = spy(returnsNext([void 0]));
      session.onInvalidMessage = onInvalidMessage;
      session.start();

      await push(input.writer, encode([3, "invalid"]));
      await session.shutdown();
      assertSpyCalls(onInvalidMessage, 1);
      assertSpyCallArgs(onInvalidMessage, 0, [[3, "invalid"]]);
    },
  );
});

Deno.test("Session.onMessageError", async (t) => {
  await t.step(
    "is called when handling a request message fails (sending a response fails)",
    async () => {
      const { session, input } = createDummySession();
      using _send = stub(
        session,
        "send",
        resolvesNext<void>([new Error("send error")]),
      );
      session.dispatcher = {
        sum() {
          return 3;
        },
      };
      const onMessageError = spy(returnsNext([void 0]));
      session.onMessageError = onMessageError;
      session.start();

      await push(input.writer, encode(buildRequestMessage(1, "sum", [1, 2])));
      await session.shutdown();
      assertSpyCalls(onMessageError, 1);
      assertIsError(
        onMessageError.calls[0].args[0],
        Error,
        "send error",
      );
      assertEquals(onMessageError.calls[0].args.slice(1), [
        buildRequestMessage(1, "sum", [1, 2]),
      ]);
    },
  );

  await t.step(
    "is called when handling a response message fails (unexpected response message is received)",
    async () => {
      const { session, input } = createDummySession();
      session.dispatcher = {
        sum() {
          return 3;
        },
      };
      const onMessageError = spy(returnsNext([void 0]));
      session.onMessageError = onMessageError;
      session.start();

      await push(input.writer, encode(buildResponseMessage(1, null, 3)));
      await session.shutdown();
      assertSpyCalls(onMessageError, 1);
      assertIsError(
        onMessageError.calls[0].args[0],
        Error,
        "Reservation with key 1 does not exist",
      );
      assertEquals(onMessageError.calls[0].args.slice(1), [
        buildResponseMessage(1, null, 3),
      ]);
    },
  );

  await t.step(
    "is called when handling a notification message fails (dispatch fails)",
    async () => {
      const { session, input } = createDummySession();
      session.dispatcher = {
        sum() {
          throw new Error("sum error");
        },
      };
      const onMessageError = spy(returnsNext([void 0]));
      session.onMessageError = onMessageError;
      session.start();

      await push(input.writer, encode(buildNotificationMessage("sum", [1, 2])));
      await session.shutdown();
      assertSpyCalls(onMessageError, 1);
      assertIsError(onMessageError.calls[0].args[0], Error, "sum error");
      assertEquals(onMessageError.calls[0].args.slice(1), [
        buildNotificationMessage("sum", [1, 2]),
      ]);
    },
  );
});
