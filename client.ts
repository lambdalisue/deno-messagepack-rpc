import { Indexer } from "https://deno.land/x/indexer@v0.1.0/mod.ts";
import { deserialize } from "./error.ts";
import {
  buildNotificationMessage,
  buildRequestMessage,
  Message,
  ResponseMessage,
} from "./message.ts";

const msgidThreshold = 2 ** 32;

type Session = {
  send: (message: Message) => void;
  recv: (msgid: number) => Promise<ResponseMessage>;
};

/**
 * Client is a wrapper of a session to send requests and notifications.
 *
 * ```ts
 * import { assertNumber } from "https://deno.land/x/unknownutil/mod.ts";
 * import { channel } from "https://deno.land/x/streamtools/mod.ts";
 * import { Session, Client } from "./mod.ts";
 *
 * const input = channel<Uint8Array>();
 * const output = channel<Uint8Array>();
 * const session = new Session(input.reader, output.writer);
 * session.dispatcher = {
 *   sum(x, y) {
 *     assertNumber(x);
 *     assertNumber(y);
 *     return x + y;
 *   },
 * };
 * session.start();
 *
 * // Create a client
 * const client = new Client(session);
 *
 * // Send a request and wait for the response.
 * console.log(await client.call("sum", 1, 2)); // 3
 *
 * // Send a notification and do not wait for the response.
 * console.log(client.notify("sum", 1, 2)); // undefined
 * ```
 */
export class Client {
  #indexer: Indexer = new Indexer(msgidThreshold);
  #session: Session;

  /**
   * Constructs a new client.
   *
   * @param {Session} session The session to communicate with.
   */
  constructor(session: Session) {
    this.#session = session;
  }

  async #recv(msgid: number): Promise<unknown> {
    const [_, __, error, result] = await this.#session.recv(msgid);
    if (error) {
      throw deserialize(error);
    }
    return result;
  }

  /**
   * Calls the method on the server and returns the result.
   *
   * It sends the request message to the server and waits for the response.
   *
   * @param {string} method The method name to call.
   * @param {unknown[]} params The parameters to pass to the method.
   * @returns {Promise<unknown>} The result of the method call.
   */
  call(
    method: string,
    ...params: unknown[]
  ): Promise<unknown> {
    const msgid = this.#indexer.next();
    const message = buildRequestMessage(msgid, method, params);
    try {
      this.#session.send(message);
    } catch (err) {
      const paramsStr = params.map((v) => JSON.stringify(v)).join(", ");
      throw new Error(`Failed to call ${method}(${paramsStr}): ${err}`);
    }
    return this.#recv(msgid);
  }

  /**
   * Notifies the method on the server.
   *
   * It sends the notification message to the server and does not wait for the result.
   *
   * @param {string} method The method name to call.
   * @param {unknown[]} params The parameters to pass to the method.
   */
  notify<T extends unknown[]>(
    method: string,
    ...params: T
  ): void {
    const message = buildNotificationMessage(method, params);
    try {
      this.#session.send(message);
    } catch (err) {
      const paramsStr = params.map((v) => JSON.stringify(v)).join(", ");
      throw new Error(`Failed to notify ${method}(${paramsStr}): ${err}`);
    }
  }
}
