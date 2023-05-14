import { assertEquals } from "https://deno.land/std/testing/asserts.ts";
import {
  buildNotificationMessage,
  buildRequestMessage,
  buildResponseMessage,
  isMessage,
} from "./message.ts";

Deno.test("buildRequestMessage", () => {
  assertEquals(
    buildRequestMessage(1, "sum", [1, 2]),
    [0, 1, "sum", [1, 2]],
  );
});

Deno.test("buildResponseMessage", async (t) => {
  await t.step("with result", () => {
    assertEquals(
      buildResponseMessage(1, null, 3),
      [1, 1, null, 3],
    );
  });

  await t.step("with error", () => {
    const error = new Error("error");
    assertEquals(
      buildResponseMessage(1, error, null),
      [1, 1, error, null],
    );
  });
});

Deno.test("buildNotificationMessage", () => {
  assertEquals(
    buildNotificationMessage("sum", [1, 2]),
    [2, "sum", [1, 2]],
  );
});

Deno.test("isMessage", async (t) => {
  await t.step("with RequestMessage", () => {
    assertEquals(
      isMessage([0, 1, "sum", [1, 2]]),
      true,
    );
  });

  await t.step("with ResponseMessage", () => {
    assertEquals(
      isMessage([1, 1, null, 3]),
      true,
    );
  });

  await t.step("with NotificationMessage", () => {
    assertEquals(
      isMessage([2, "sum", [1, 2]]),
      true,
    );
  });

  await t.step("with invalid message", () => {
    assertEquals(
      isMessage("invalid message"),
      false,
    );
  });

  await t.step("with invalid message", () => {
    assertEquals(
      isMessage([3, "sum", [1, 2]]),
      false,
    );
  });
});
