import {
  assert,
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.186.0/testing/asserts.ts";
import {
  handleNotificationMessage,
  handleRequestMessage,
  handleResponseMessage,
  NotificationMessage,
  RequestMessage,
  ResponseMessage,
} from "./message.ts";

Deno.test("handleRequestMessage", async (t) => {
  await t.step(
    "invokes a dispatch function and return the response with the result",
    async () => {
      let called = false;
      const dispatch = (method: string, params: unknown[]) => {
        called = true;
        assertEquals(method, "sum");
        assertEquals(params, [1, 2]);
        return 3;
      };
      const message: RequestMessage = [0, 1, "sum", [1, 2]];
      const [type, msgid, error, result] = await handleRequestMessage(
        message,
        dispatch,
      );
      assert(called);
      assertEquals(type, 1);
      assertEquals(msgid, 1);
      assertEquals(error, null);
      assertEquals(result, 3);
    },
  );

  await t.step(
    "invokes a dispatch function and return the response with the error",
    async () => {
      let called = false;
      const dispatch = () => {
        called = true;
        throw new Error("This is error");
      };
      const message: RequestMessage = [0, 1, "sum", [1, 2]];
      const [type, msgid, error, result] = await handleRequestMessage(
        message,
        dispatch,
      );
      assert(called);
      assertEquals(type, 1);
      assertEquals(msgid, 1);
      assertEquals(Object.assign(error!, { stack: undefined }), {
        name: "Error",
        message: "This is error",
        stack: undefined,
      });
      assertEquals(result, null);
    },
  );
});

Deno.test("handleResponseMessage", async (t) => {
  await t.step(
    "resolves the reservator with the result of the response",
    () => {
      let called = false;
      const reservator = {
        resolve: (msgid: number, result: unknown) => {
          called = true;
          assertEquals(msgid, 1);
          assertEquals(result, ["sum", [1, 2]]);
        },
        reject: () => {
          throw new Error("unreachable");
        },
      };
      const message: ResponseMessage = [1, 1, null, ["sum", [1, 2]]];
      handleResponseMessage(message, reservator.resolve, reservator.reject);
      assert(called);
    },
  );

  await t.step(
    "rejects the reservator with the error of the response",
    () => {
      let called = false;
      const reservator = {
        resolve: () => {
          throw new Error("unreachable");
        },
        reject: (_: number, error: Error) => {
          called = true;
          assertEquals(error.name, "Error");
          assertEquals(error.message, "This is error");
        },
      };
      const message: ResponseMessage = [1, 1, {
        name: "Error",
        message: "This is error",
      }, null];
      handleResponseMessage(message, reservator.resolve, reservator.reject);
      assert(called);
    },
  );
});

Deno.test("handleNotificationMessage", async (t) => {
  await t.step(
    "invokes a dispatch function",
    async () => {
      let called = false;
      const dispatch = (method: string, params: unknown[]) => {
        called = true;
        assertEquals(method, "sum");
        assertEquals(params, [1, 2]);
        return 3;
      };
      const message: NotificationMessage = [2, "sum", [1, 2]];
      await handleNotificationMessage(message, dispatch);
      assert(called);
    },
  );

  await t.step(
    "invokes a dispatch function and throw the error",
    async () => {
      let called = false;
      const dispatch = () => {
        called = true;
        throw new Error("This is error");
      };
      const message: NotificationMessage = [2, "sum", [1, 2]];
      await assertRejects(
        () => handleNotificationMessage(message, dispatch),
        Error,
      );
      assert(called);
    },
  );
});
