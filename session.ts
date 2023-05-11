import { Reservator } from "https://deno.land/x/reservator@v0.1.0/mod.ts";
import {
  DecodeStream,
  EncodeStream,
} from "https://deno.land/x/messagepack@v0.1.0/mod.ts";
import {
  Channel,
  channel,
} from "https://deno.land/x/streamtools@v0.4.0/mod.ts";
import { dispatch, Dispatcher } from "./dispatcher.ts";
import { Client } from "./client.ts";
import {
  handleNotificationMessage,
  handleRequestMessage,
  handleResponseMessage,
  Message,
} from "./message.ts";

export type MessageErrorHandler = (
  error: Error,
  message: Message,
) => void | PromiseLike<void>;

export type SessionOptions = {
  onMessageError?: MessageErrorHandler;
};

/**
 * Session represents a MessagePack-RPC session.
 */
export class Session {
  #reservator: Reservator<number, unknown> = new Reservator();
  #onMessageError: MessageErrorHandler;
  #outer: Channel<Uint8Array>;
  #inner: Channel<Message>;
  #innerWriter?: WritableStreamDefaultWriter<Message>;
  dispatcher: Dispatcher = {};

  /**
   * Construct a new session.
   *
   * @param {ReadableStream<Uint8Array>} reader The reader to read messages from.
   * @param {WritableStream<Uint8Array>} writer The writer to write messages to. */
  constructor(
    reader: ReadableStream<Uint8Array>,
    writer: WritableStream<Uint8Array>,
    options: SessionOptions = {},
  ) {
    const { onMessageError } = options;
    this.#outer = { reader, writer };
    this.#inner = channel<Message>();
    this.#onMessageError = onMessageError ?? ((error, message) => {
      console.error(`Failed to handle message ${message}: ${error}`);
    });
  }

  /**
   * Start the session.
   *
   * @param {(client: Client) => void | PromiseLike<void>} f The function to handle the session.
   */
  async start(f: (client: Client) => void | PromiseLike<void>): Promise<void> {
    const controller = new AbortController();
    const client = new Client(this);
    const runner = async () => {
      try {
        await f(client);
      } finally {
        controller.abort();
      }
    };
    await Promise.all([
      this.#start(controller),
      runner(),
    ]);
  }

  send(message: Message): void {
    if (!this.#innerWriter) {
      throw new Error("Session is not started");
    }
    this.#innerWriter.write(message);
  }

  recv(msgid: number): Promise<unknown> {
    return this.#reservator.reserve(msgid);
  }

  #dispatch(method: string, params: unknown[]): Promise<unknown> {
    return dispatch(this.dispatcher, method, params);
  }

  async #start(controller: AbortController): Promise<void> {
    const { signal } = controller;
    this.#innerWriter = this.#inner.writer.getWriter();

    // outer -> inner
    const consumer = this.#outer.reader
      .pipeThrough(new DecodeStream())
      .pipeTo(
        new WritableStream<Message>({
          write: (message) => {
            this.#handleMessage(message).catch((err) => {
              this.#onMessageError(err, message);
            });
          },
          close: () => controller.abort(),
        }),
        { signal },
      );

    // inner -> outer
    const producer = this.#inner.reader
      .pipeThrough(new EncodeStream<Message>())
      .pipeTo(this.#outer.writer, { signal });

    await Promise.all([consumer, producer])
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        return err;
      })
      .finally(() => {
        this.#innerWriter?.releaseLock();
        this.#innerWriter = undefined;
      });
  }

  async #handleMessage(message: Message): Promise<void> {
    switch (message[0]) {
      case 0: {
        const response = await handleRequestMessage(
          message,
          (method, params) => this.#dispatch(method, params),
        );
        this.send(response);
        break;
      }
      case 2: // NotificationMessage
        await handleNotificationMessage(
          message,
          (method, params) => this.#dispatch(method, params),
        );
        break;
      case 1: // ResponseMessage
        await handleResponseMessage(
          message,
          (msgid, result) => this.#reservator.resolve(msgid, result),
          (msgid, error) => this.#reservator.reject(msgid, error),
        );
        break;
      default:
        throw new Error("Unknown message type");
    }
  }
}
