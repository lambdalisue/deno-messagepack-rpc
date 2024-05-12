import { Reservator } from "@lambdalisue/reservator";
import { DecodeStream, EncodeStream } from "@lambdalisue/messagepack";
import { type Channel, channel } from "@lambdalisue/streamtools";
import { dispatch, type Dispatcher } from "./dispatcher.ts";
import {
  buildResponseMessage,
  isMessage,
  type Message,
  type NotificationMessage,
  type RequestMessage,
  type ResponseMessage,
} from "./message.ts";

// Symbol used to shutdown session.
const shutdown = Symbol("shutdown");

export type SessionOptions = {
  /**
   * Error serialization function.
   */
  errorSerializer?: (err: unknown) => unknown;
};

/**
 * Session represents a MessagePack-RPC session.
 *
 * Use `Client` to call or notify the methods of the remote.
 *
 * ```ts
 * import { assert, is } from "@core/unknownutil";
 * import { channel } from "@lambdalisue/streamtools";
 * import { Session, Client } from "@lambdalisue/messagepack-rpc";
 *
 * const input = channel<Uint8Array>();
 * const output = channel<Uint8Array>();
 * const session = new Session(input.reader, output.writer);
 *
 * // Define APIs of RPC
 * session.dispatcher = {
 *   sum(x, y) {
 *     assert(x, is.Number);
 *     assert(y, is.Number);
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
  #outer: Channel<Uint8Array>;
  #inner: Channel<Message>;
  #running?: {
    reservator: Reservator<number, ResponseMessage>;
    innerWriter: WritableStreamDefaultWriter<Message>;
    consumerController: AbortController;
    producerController: AbortController;
    waiter: Promise<void>;
  };
  #errorSerializer: (err: unknown) => unknown;

  /**
   * The dispatcher to handle incoming requests.
   */
  dispatcher: Dispatcher = {};

  /**
   * The callback to handle invalid messages.
   * Invalid messages are messages that are not a request, a response, or a notification of MessagePack-RPC.
   * The default behavior is to ignore invalid messages.
   */
  onInvalidMessage?: (message: unknown) => void;

  /**
   * The callback to handle errors on handling messages.
   * The default behavior is to ignore errors.
   */
  onMessageError?: (error: Error, message: Message) => void;

  /**
   * Constructs a new session.
   *
   * @param reader The reader to read messages from.
   * @param writer The writer to write messages to.
   * @param options The options.
   */
  constructor(
    reader: ReadableStream<Uint8Array>,
    writer: WritableStream<Uint8Array>,
    options: SessionOptions = {},
  ) {
    const { errorSerializer = (err) => err } = options;
    this.#outer = { reader, writer };
    this.#inner = channel();
    this.#errorSerializer = errorSerializer;
  }

  /**
   * Sends a message to the writer.
   * @param message The message to send.
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
   * @param msgid The message ID to receive.
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
   */
  start(): void {
    if (this.#running) {
      throw new Error("Session is already running");
    }
    const reservator = new Reservator<number, ResponseMessage>();
    const innerWriter = this.#inner.writer.getWriter();
    const consumerController = new AbortController();
    const producerController = new AbortController();

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
   * @returns A promise that resolves when the session is closed.
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
   * @returns A promise that resolves when the session is closed.
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
   * @returns A promise that resolves when the session is closed.
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
  ): Promise<{ error: unknown; result: unknown }> {
    try {
      const result = await dispatch(this.dispatcher, method, params);
      return { error: null, result };
    } catch (err: unknown) {
      return { error: err, result: null };
    }
  }

  #handleMessage(message: unknown): void {
    if (isMessage(message)) {
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
    this.onInvalidMessage?.call(this, message);
  }

  async #handleRequestMessage(message: RequestMessage): Promise<void> {
    try {
      const [_, msgid, method, params] = message;
      const { error, result } = await this.#dispatch(method, params);
      this.send(
        buildResponseMessage(
          msgid,
          error ? this.#errorSerializer(error) : null,
          result,
        ),
      );
    } catch (error) {
      this.onMessageError?.call(this, error, message);
    }
  }

  #handleResponseMessage(message: ResponseMessage): void {
    try {
      const [_, msgid, __, ___] = message;
      const { reservator } = this.#running!;
      reservator.resolve(msgid, message);
    } catch (error) {
      this.onMessageError?.call(this, error, message);
    }
  }

  async #handleNotificationMessage(
    message: NotificationMessage,
  ): Promise<void> {
    try {
      const [_, method, params] = message;
      const { error } = await this.#dispatch(method, params);
      if (error) {
        throw error;
      }
    } catch (error) {
      this.onMessageError?.call(this, error, message);
    }
  }
}
