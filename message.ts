import {
  isArray,
  isNumber,
  isString,
} from "https://deno.land/x/unknownutil@v2.1.1/mod.ts";

/**
 * Request message
 */
export type RequestMessage = [
  type: 0,
  msgid: number,
  method: string,
  params: unknown[],
];

/**
 * Response message
 */
export type ResponseMessage = [
  type: 1,
  msgid: number,
  error: null | unknown,
  result: null | unknown,
];

/**
 * Notification message
 */
export type NotificationMessage = [
  type: 2,
  method: string,
  params: unknown[],
];

/**
 * Message
 */
export type Message = RequestMessage | ResponseMessage | NotificationMessage;

export function buildRequestMessage(
  msgid: number,
  method: string,
  params: unknown[],
): RequestMessage {
  return [0, msgid, method, params];
}

export function buildResponseMessage(
  msgid: number,
  error: null | unknown,
  result: null | unknown,
): ResponseMessage {
  return [1, msgid, error, result];
}

export function buildNotificationMessage(
  method: string,
  params: unknown[],
): NotificationMessage {
  return [2, method, params];
}

/**
 * Checks if the given value is a message.
 *
 * @param {unknown} message The value to check.
 * @returns {boolean} `true` if the given value is a message, otherwise `false`.
 */
export function isMessage(message: unknown): message is Message {
  if (!isArray(message)) {
    return false;
  }
  switch (message[0]) {
    case 0: {
      const [_, msgid, method, params] = message;
      return isNumber(msgid) && isString(method) && isArray(params);
    }
    case 1: {
      const [_, msgid, __, ___] = message;
      return isNumber(msgid);
    }
    case 2: {
      const [_, method, params] = message;
      return isString(method) && isArray(params);
    }
  }
  return false;
}
