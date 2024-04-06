import { is } from "@core/unknownutil";

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
  if (!is.Array(message)) {
    return false;
  }
  switch (message[0]) {
    case 0: {
      const [_, msgid, method, params] = message;
      return is.Number(msgid) && is.String(method) && is.Array(params);
    }
    case 1: {
      const [_, msgid, __, ___] = message;
      return is.Number(msgid);
    }
    case 2: {
      const [_, method, params] = message;
      return is.String(method) && is.Array(params);
    }
  }
  return false;
}
