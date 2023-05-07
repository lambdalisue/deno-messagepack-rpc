import { deserialize, serialize } from "./error.ts";

/**
 * Threshold of msgid
 */
export const msgidThreshold = 2 ** 32;

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
  error: null | Error,
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
  error: null | Error,
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
 * Handle a request message
 *
 * @param {RequestMessage} message Request message
 * @param {(method: string, params: unknown[]) => unknown} dispatch Dispatch function
 * @returns {Promise<ResponseMessage>} Response message
 */
export async function handleRequestMessage(
  message: RequestMessage,
  dispatch: (method: string, params: unknown[]) => unknown,
): Promise<ResponseMessage> {
  const [_, msgid, method, params] = message;
  try {
    const result = await dispatch(method, params);
    return buildResponseMessage(msgid, null, result);
  } catch (err: unknown) {
    return buildResponseMessage(msgid, serialize(err), null);
  }
}

/**
 * Handle a response message
 *
 * @param {ResponseMessage} message Response message
 * @param {(msgid: number, result: unknown) => void} resolve Resolve function
 * @param {(msgid: number, error: Error) => void} reject Reject function
 */
export function handleResponseMessage(
  message: ResponseMessage,
  resolve: (msgid: number, result: unknown) => void,
  reject: (msgid: number, error: Error) => void,
): Promise<void> {
  try {
    const [_, msgid, error, result] = message;
    if (error) {
      reject(msgid, deserialize(error));
    } else {
      resolve(msgid, result);
    }
    return Promise.resolve();
  } catch (err: unknown) {
    return Promise.reject(err);
  }
}

/**
 * Handle a notification message
 *
 * @param {NotificationMessage} message Notification message
 * @param {(method: string, params: unknown[]) => unknown} dispatch Dispatch function
 */
export async function handleNotificationMessage(
  message: NotificationMessage,
  dispatch: (method: string, params: unknown[]) => unknown,
): Promise<void> {
  const [_, method, params] = message;
  await dispatch(method, params);
}
