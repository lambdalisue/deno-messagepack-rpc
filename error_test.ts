import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.186.0/testing/asserts.ts";
import { deserialize, isErrorRecord, serialize } from "./error.ts";

class CustomError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

Deno.test("serialize", async (t) => {
  await t.step("returns an ErrorRecord instance from Error", () => {
    const err = serialize(new CustomError("This is error"));
    assert(isErrorRecord(err));
    assertEquals(err.name, "CustomError");
    assertEquals(err.message, "This is error");
  });

  await t.step("returns an ErrorRecord instance from string error", () => {
    const err = serialize("This is string error");
    assert(isErrorRecord(err));
    assertEquals(err.name, "Error");
    assertEquals(err.message, "This is string error");
  });
});

Deno.test("deserialize", async (t) => {
  await t.step("returns an Error instance from ErrorRecord", () => {
    const err = deserialize({
      name: "CustomError",
      message: "This is error",
    });
    assert(err instanceof Error);
    assertEquals(err.name, "CustomError");
    assertEquals(err.message, "This is error");
  });

  await t.step("returns an Error instance from string error", () => {
    const err = deserialize("This is string error");
    assert(err instanceof Error);
    assertEquals(err.name, "Error");
    assertEquals(err.message, "This is string error");
  });
});
