import {
  assert,
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.185.0/testing/asserts.ts";
import {
  assertSnapshot,
} from "https://deno.land/std@0.185.0/testing/snapshot.ts";
import { assertNumber } from "https://deno.land/x/unknownutil@v2.1.0/assert.ts";
import { deferred, delay } from "https://deno.land/std@0.185.0/async/mod.ts";
import { decode, encode } from "https://deno.land/x/messagepack@v0.1.0/mod.ts";
import {
  buildNotificationMessage,
  buildRequestMessage,
  buildResponseMessage,
} from "./message.ts";
import { Session } from "./session.ts";

Deno.test("Session", async (t) => {
  await t.step(
    "invokes a corresponding method and sends back a result when a request is received",
    async (t) => {
      const output: unknown[] = [];
      const session = new Session(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encode(buildRequestMessage(0, "sum", [1, 2])));
            controller.close();
          },
        }),
        new WritableStream({
          write(chunk) {
            output.push(decode(chunk));
          },
        }),
      );

      let called = false;
      session.dispatcher = {
        sum(x, y) {
          called = true;
          assertNumber(x);
          assertNumber(y);
          return x + y;
        },
      };

      await session.start();

      assert(called);
      assertSnapshot(t, output);
    },
  );

  await t.step(
    "invokes a corresponding method and sends back an error result when a request is received (error)",
    async (t) => {
      const output: unknown[] = [];
      const session = new Session(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encode(buildRequestMessage(0, "sum", [1, 2])));
            controller.close();
          },
        }),
        new WritableStream({
          write(chunk) {
            output.push(decode(chunk));
          },
        }),
      );

      let called = false;
      session.dispatcher = {
        sum() {
          called = true;
          throw new Error("Failed");
        },
      };

      await session.start();

      assert(called);
      assertSnapshot(t, output);
    },
  );

  await t.step(
    "sends back an error response when a request is received but no corresponding method exists",
    async (t) => {
      const output: unknown[] = [];
      const session = new Session(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encode(buildRequestMessage(0, "sum", [1, 2])));
            controller.close();
          },
        }),
        new WritableStream({
          write(chunk) {
            output.push(decode(chunk));
          },
        }),
      );

      await session.start();

      assertSnapshot(t, output);
    },
  );

  await t.step(
    "invokes a corresponding method when a notification is received",
    async () => {
      const output: unknown[] = [];
      const session = new Session(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encode(buildNotificationMessage("sum", [1, 2])));
            controller.close();
          },
        }),
        new WritableStream({
          write(chunk) {
            output.push(decode(chunk));
          },
        }),
      );

      let called = false;
      session.dispatcher = {
        sum(x, y) {
          called = true;
          assertNumber(x);
          assertNumber(y);
          return x + y;
        },
      };

      await session.start();

      assert(called);
      assertEquals(output, []);
    },
  );

  await t.step(
    "invokes a corresponding method and invokes 'onUnexpectedError()' when a notification is received (error)",
    async () => {
      let onUnexpectedErrorCalled = false;
      const output: unknown[] = [];
      const session = new Session(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encode(buildNotificationMessage("sum", [1, 2])));
            controller.close();
          },
        }),
        new WritableStream({
          write(chunk) {
            output.push(decode(chunk));
          },
        }),
        {
          onUnexpectedError() {
            onUnexpectedErrorCalled = true;
          },
        },
      );

      let called = false;
      session.dispatcher = {
        sum() {
          called = true;
          throw new Error("Failed");
        },
      };

      await session.start();

      assert(called);
      assert(onUnexpectedErrorCalled);
      assertEquals(output, []);
    },
  );

  await t.step(
    "invokes 'onUnexpectedError()' when a notification is received but no corresponding method exists",
    async () => {
      let onUnexpectedErrorCalled = false;
      const output: unknown[] = [];
      const session = new Session(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encode(buildNotificationMessage("sum", [1, 2])));
            controller.close();
          },
        }),
        new WritableStream({
          write(chunk) {
            output.push(decode(chunk));
          },
        }),
        {
          onUnexpectedError() {
            onUnexpectedErrorCalled = true;
          },
        },
      );

      await session.start();

      assert(onUnexpectedErrorCalled);
      assertEquals(output, []);
    },
  );

  await t.step(
    "invokes onUnexpectedMessage and ignore when unknown message is received",
    async (t) => {
      let onUnexpectedMessageCalled = false;
      const output: unknown[] = [];
      const session = new Session(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([0, 1, 2, 3, 4]));
            controller.enqueue(encode(buildRequestMessage(0, "sum", [1, 2])));
            controller.enqueue(new Uint8Array([5, 6, 7, 8, 9]));
            controller.close();
          },
        }),
        new WritableStream({
          write(chunk) {
            output.push(decode(chunk));
          },
        }),
        {
          onUnexpectedMessage() {
            onUnexpectedMessageCalled = true;
          },
        },
      );

      let called = false;
      session.dispatcher = {
        sum(x, y) {
          called = true;
          assertNumber(x);
          assertNumber(y);
          return x + y;
        },
      };

      await session.start();

      assert(called);
      assert(onUnexpectedMessageCalled);
      assertSnapshot(t, output);
    },
  );

  await t.step(
    "resolves a promise returned by 'wait()' method when a response is received",
    async () => {
      const guard = deferred<void>();
      const output: unknown[] = [];
      const session = new Session(
        new ReadableStream({
          async start(controller) {
            await guard;
            controller.enqueue(
              encode(buildResponseMessage(0, null, "Success")),
            );
            controller.close();
          },
        }),
        new WritableStream({
          write(chunk) {
            output.push(decode(chunk));
          },
        }),
      );

      await Promise.all([
        session.start(),
        (async () => {
          const controller = new AbortController();
          const { signal } = controller;
          const waiter = session.wait(0);

          await assertRejects(
            () => deadline(waiter, 100, { signal }),
            Error,
            "Timeout",
          );
          guard.resolve();
          assertEquals(
            await deadline(waiter, 100, { signal }),
            "Success",
          );

          controller.abort();
        })(),
      ]);
    },
  );

  await t.step(
    "rejects a promise returned by 'wait()' method when an error response is received",
    async () => {
      const guard = deferred<void>();
      const output: unknown[] = [];
      const session = new Session(
        new ReadableStream({
          async start(controller) {
            await guard;
            controller.enqueue(
              encode(buildResponseMessage(0, ["TypeError", "Failed"], null)),
            );
            controller.close();
          },
        }),
        new WritableStream({
          write(chunk) {
            output.push(decode(chunk));
          },
        }),
      );

      await Promise.all([
        session.start(),
        (async () => {
          const controller = new AbortController();
          const { signal } = controller;
          const waiter = session.wait(0);

          await assertRejects(
            () => deadline(waiter, 100, { signal }),
            Error,
            "Timeout",
          );
          guard.resolve();
          await assertRejects(
            () => deadline(waiter, 100, { signal }),
            Error,
            "Failed",
          );

          controller.abort();
        })(),
      ]);
    },
  );

  await t.step(
    "sends arbitrary message when 'send()' method is called",
    async () => {
      const output: unknown[] = [];
      const session = new Session(
        new ReadableStream(),
        new WritableStream({
          write(chunk) {
            output.push(decode(chunk));
          },
        }),
      );

      session.start();

      await session.send(buildRequestMessage(0, "sum", [1, 2]));
      await session.send(buildResponseMessage(0, null, 3));
      await session.send(buildNotificationMessage("sum", [1, 2]));
      assertEquals(
        output,
        [
          buildRequestMessage(0, "sum", [1, 2]),
          buildResponseMessage(0, null, 3),
          buildNotificationMessage("sum", [1, 2]),
        ],
      );
    },
  );
});

async function deadline<T>(
  p: Promise<T>,
  ms: number,
  { signal }: { signal?: AbortSignal } = {},
): Promise<T> {
  const waiter = delay(ms, { signal });
  return await Promise.race([
    waiter.then(() => Promise.reject(new Error("Timeout"))),
    p,
  ]);
}
