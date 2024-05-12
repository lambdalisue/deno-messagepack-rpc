import { Indexer } from "@lambdalisue/indexer";
import {
  buildNotificationMessage,
  buildRequestMessage,
  type Message,
  type ResponseMessage,
} from "./message.ts";

const msgidThreshold = 2 ** 32;

type Session = {
  send: (message: Message) => void;
  recv: (msgid: number) => Promise<ResponseMessage>;
};

export type ClientOptions = {
  /**
   * Message ID indexer.
   */
  indexer?: Indexer;

  /**
   * Error deserialization function.
   */
  errorDeserializer?: (err: unknown) => unknown;
};

/**
 * Client is a wrapper of a session to send requests and notifications.
 *
 * ```ts
 * import { assert, is } from "@core/unknownutil";
 * import { channel } from "@lambdalisue/streamtools";
 * import { Session, Client } from "@lambdalisue/messagepack-rpc";
 *
 * const input = channel<Uint8Array>();
 * const output = channel<Uint8Array>();
 * const session = new Session(input.reader, output.writer);
 * session.dispatcher = {
 *   sum(x, y) {
 *     assert(x, is.Number);
 *     assert(y, is.Number);
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
  #session: Session;
  #indexer: Indexer;
  #errorDeserializer: (err: unknown) => unknown;

  /**
   * Constructs a new client.
   *
   * Note that the indexer must be unique for each session to avoid message ID conflicts.
   * If multiple clients are created for a single session, specify a single indexer.
   *
   * @param {Session} session The session to communicate with.
   * @param {ClientOptions} options The options to configure the client.
   */
  constructor(session: Session, options: ClientOptions = {}) {
    const {
      indexer = new Indexer(msgidThreshold),
      errorDeserializer = (err) => err,
    } = options;
    this.#session = session;
    this.#indexer = indexer;
    this.#errorDeserializer = errorDeserializer;
  }

  async #recv(msgid: number): Promise<unknown> {
    const [_, __, error, result] = await this.#session.recv(msgid);
    if (error) {
      throw this.#errorDeserializer(error);
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
  notify(
    method: string,
    ...params: unknown[]
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
