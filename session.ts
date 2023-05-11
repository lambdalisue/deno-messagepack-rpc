import { Reservator } from "https://deno.land/x/reservator@v0.1.0/mod.ts";
import {
  DecodeStream,
  EncodeStream,
} from "https://deno.land/x/messagepack@v0.1.0/mod.ts";
import {
  Channel,
  channel,
} from "https://deno.land/x/streamtools@v0.4.1/mod.ts";
import { dispatch, Dispatcher } from "./dispatcher.ts";
import { serialize } from "./error.ts";
import {
  buildResponseMessage,
  isMessage,
  Message,
  NotificationMessage,
  RequestMessage,
  ResponseMessage,
} from "./message.ts";

// Symbol used to shutdown session.
const shutdown = Symbol("shutdown");

export type SessionOptions = {
  /**
   * The callback to handle invalid messages.
   * Invalid messages are messages that are not a request, a response, or a notification of MessagePack-RPC.
   * The default behavior is to ignore invalid messages.
   */
  onInvalidMessage?: (message: unknown) => void;
  /**
   * The callback to handle errors on request messages.
   * The default behavior is to ignore errors.
   */
  onRequestMessageError?: (message: RequestMessage, error: Error) => void;
  /**
   * The callback to handle errors on response messages.
   * The default behavior is to ignore errors.
   */
  onResponseMessageError?: (message: ResponseMessage, error: Error) => void;
  /**
   * The callback to handle errors on notification messages.
   * The default behavior is to ignore errors.
   */
  onNotificationMessageError?: (
    message: NotificationMessage,
    error: Error,
  ) => void;
};

/**
 * Session represents a MessagePack-RPC session.
 *
 * Use `Client` to call or notify the methods of the remote.
 *
 * ```ts
 * import { assertNumber } from "https://deno.land/x/unknownutil/mod.ts";
 * import { channel } from "https://deno.land/x/streamtools/mod.ts";
 * import { Session, Client } from "./mod.ts";
 *
 * const input = channel<Uint8Array>();
 * const output = channel<Uint8Array>();
 * const session = new Session(input.reader, output.writer);
 *
 * // Define APIs of RPC
 * session.dispatcher = {
 *   sum(x, y) {
 *     assertNumber(x);
 *     assertNumber(y);
 *     return x + y;
 *   },
 * };
 *
 * // Start the session
 * session.start();
 *
 * // Do whatever you want
 *
 * // Shutdown the session
 * await session.shutdown();
 * ```
 */
export class Session {
  #onInvalidMessage?: (message: unknown) => void;
  #onRequestMessageError?: (message: RequestMessage, error: Error) => void;
  #onResponseMessageError?: (message: ResponseMessage, error: Error) => void;
  #onNotificationMessageError?: (
    message: NotificationMessage,
    error: Error,
  ) => void;
  #outer: Channel<Uint8Array>;
  #inner: Channel<Message>;
  #running?: {
    reservator: Reservator<number, ResponseMessage>;
    innerWriter: WritableStreamDefaultWriter<Message>;
    consumerController: AbortController;
    producerController: AbortController;
    waiter: Promise<void>;
  };

  /**
   * The dispatcher to handle incoming requests.
   */
  dispatcher: Dispatcher = {};

  /**
   * Constructs a new session.
   *
   * @param {ReadableStream<Uint8Array>} reader The reader to read messages from.
   * @param {WritableStream<Uint8Array>} writer The writer to write messages to.
   * @param {SessionOptions} options The options to configure the session.
   */
  constructor(
    reader: ReadableStream<Uint8Array>,
    writer: WritableStream<Uint8Array>,
    options: SessionOptions = {},
  ) {
    const {
      onInvalidMessage,
      onRequestMessageError,
      onResponseMessageError,
      onNotificationMessageError,
    } = options;
    this.#onInvalidMessage = onInvalidMessage;
    this.#onRequestMessageError = onRequestMessageError;
    this.#onResponseMessageError = onResponseMessageError;
    this.#onNotificationMessageError = onNotificationMessageError;
    this.#outer = { reader, writer };
    this.#inner = channel();
  }

  /**
   * Sends a message to the writer.
   * @param {Message} message The message to send.
   */
  send(message: Message): void {
    if (!this.#running) {
      throw new Error("Session is not running");
    }
    const { innerWriter } = this.#running;
    innerWriter.write(message);
  }

  /**
   * Receives a message from the reader.
   * @param {number} msgid The message ID to receive.
   */
  recv(msgid: number): Promise<ResponseMessage> {
    if (!this.#running) {
      throw new Error("Session is not running");
    }
    const { reservator } = this.#running;
    return reservator.reserve(msgid);
  }

  /**
   * Starts the session.
   *
   * The session will be closed when the reader or the writer is closed.
   *
   * @param {object} options The options to start the session.
   */
  start(options: { signal?: AbortSignal } = {}): void {
    if (this.#running) {
      throw new Error("Session is already running");
    }
    const reservator = new Reservator<number, ResponseMessage>();
    const innerWriter = this.#inner.writer.getWriter();
    const consumerController = new AbortController();
    const producerController = new AbortController();

    const abort = (reason: unknown) => {
      if (this.#running) {
        const { consumerController, producerController } = this.#running;
        consumerController.abort(reason);
        producerController.abort(reason);
      }
    };
    const { signal } = options;
    signal?.addEventListener("abort", abort);

    const ignoreShutdownError = (err: unknown) => {
      if (err === shutdown) {
        return;
      }
      return Promise.reject(err);
    };

    // outer -> inner
    const consumer = this.#outer.reader
      .pipeThrough(new DecodeStream())
      .pipeTo(
        new WritableStream({ write: (m) => this.#handleMessage(m) }),
        { signal: consumerController.signal },
      )
      .catch(ignoreShutdownError)
      .finally(async () => {
        await innerWriter.ready;
        await innerWriter.close();
      });

    // inner -> outer
    const producer = this.#inner.reader
      .pipeThrough(new EncodeStream<Message>())
      .pipeTo(this.#outer.writer, { signal: producerController.signal })
      .catch(ignoreShutdownError);

    const waiter = Promise.all([consumer, producer])
      .then(() => {})
      .finally(() => {
        signal?.removeEventListener("abort", abort);
        innerWriter.releaseLock();
        this.#running = undefined;
      });

    this.#running = {
      reservator,
      innerWriter,
      consumerController,
      producerController,
      waiter,
    };
  }

  /**
   * Waits until the session is closed.
   * @returns {Promise<void>} A promise that resolves when the session is closed.
   */
  wait(): Promise<void> {
    if (!this.#running) {
      throw new Error("Session is not running");
    }
    const { waiter } = this.#running;
    return waiter;
  }

  /**
   * Shuts down the session.
   *
   * The session will stop receiving messages from the reader and wait all messages are processed.
   * Use `forceShutdown` to shutdown the session forcibly.
   *
   * @returns {Promise<void>} A promise that resolves when the session is closed.
   */
  shutdown(): Promise<void> {
    if (!this.#running) {
      throw new Error("Session is not running");
    }
    // Abort consumer to shutdown session properly.
    const { consumerController, waiter } = this.#running;
    consumerController.abort(shutdown);
    return waiter;
  }

  /**
   * Shuts down the session forcibly.
   *
   * The session will stop receiving messages from the reader and writing messages to the writer.
   * Use `shutdown` to shutdown the session properly.
   *
   * @returns {Promise<void>} A promise that resolves when the session is closed.
   */
  forceShutdown(): Promise<void> {
    if (!this.#running) {
      throw new Error("Session is not running");
    }
    // Abort consumer and producer to shutdown session forcibly.
    const { consumerController, producerController, waiter } = this.#running;
    producerController.abort(shutdown);
    consumerController.abort(shutdown);
    return waiter;
  }

  async #dispatch(
    method: string,
    params: unknown[],
  ): Promise<{ error: Error | null; result: unknown }> {
    try {
      const result = await dispatch(this.dispatcher, method, params);
      return { error: null, result };
    } catch (err: unknown) {
      return { error: serialize(err), result: null };
    }
  }

  #handleMessage(message: unknown): void {
    if (!isMessage(message)) {
      this.#onInvalidMessage?.call(this, message);
      return;
    }
    switch (message[0]) {
      case 0:
        this.#handleRequestMessage(message);
        return;
      case 1:
        this.#handleResponseMessage(message);
        return;
      case 2:
        this.#handleNotificationMessage(message);
        return;
    }
  }

  async #handleRequestMessage(message: RequestMessage): Promise<void> {
    try {
      const [_, msgid, method, params] = message;
      const { error, result } = await this.#dispatch(method, params);
      this.send(buildResponseMessage(msgid, error, result));
    } catch (error) {
      this.#onRequestMessageError?.call(this, message, error);
    }
  }

  #handleResponseMessage(message: ResponseMessage): void {
    try {
      const [_, msgid, __, ___] = message;
      const { reservator } = this.#running!;
      reservator.resolve(msgid, message);
    } catch (error) {
      this.#onResponseMessageError?.call(this, message, error);
    }
  }

  async #handleNotificationMessage(
    message: NotificationMessage,
  ): Promise<void> {
    try {
      const [_, method, params] = message;
      await this.#dispatch(method, params);
    } catch (error) {
      this.#onNotificationMessageError?.call(this, message, error);
    }
  }
}
