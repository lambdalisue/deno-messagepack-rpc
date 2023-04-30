import { Reservator } from "https://deno.land/x/reservator@v0.1.0/mod.ts";
import {
  DecodeStream,
  encode,
} from "https://deno.land/x/messagepack@v0.1.0/mod.ts";
import {
  buildResponseMessage,
  isNotificationMessage,
  isRequestMessage,
  isResponseMessage,
  Message,
  MessageError,
  MessageId,
  MessageResult,
  NotificationMessage,
  RequestMessage,
  ResponseMessage,
} from "./message.ts";
import { Dispatcher } from "./dispatcher.ts";

export type SessionOptions = {
  onUnexpectedError?: (message: Message, err: Error) => void | Promise<void>;
  onUnexpectedMessage?: (message: unknown) => void | Promise<void>;
};

export class Session {
  #reservator: Reservator<MessageId, unknown>;
  #rstream: ReadableStream<Uint8Array>;
  #wstream: WritableStream<Uint8Array>;
  #onUnexpectedError: (message: Message, err: Error) => void | Promise<void>;
  #onUnexpectedMessage: (message: unknown) => void | Promise<void>;

  dispatcher: Dispatcher;

  constructor(
    rstream: ReadableStream<Uint8Array>,
    wstream: WritableStream<Uint8Array>,
    options: SessionOptions = {},
  ) {
    const {
      onUnexpectedError = defaultOnUnexpectedError,
      onUnexpectedMessage = () => {},
    } = options;
    this.#reservator = new Reservator();
    this.#rstream = rstream;
    this.#wstream = wstream;
    this.#onUnexpectedError = onUnexpectedError;
    this.#onUnexpectedMessage = onUnexpectedMessage;
    this.dispatcher = {};
  }

  async #dispatch(
    method: string,
    params: unknown[],
  ): Promise<[MessageResult, MessageError]> {
    try {
      return [
        await this.dispatcher[method](...params),
        null,
      ];
    } catch (err: unknown) {
      if (err instanceof TypeError && !hasMethod(this.dispatcher, method)) {
        return [
          null,
          new Error(
            `No MessagePack-RPC method '${method}' exists`,
          ),
        ];
      }
      return [null, err];
    }
  }

  async send(message: Message): Promise<void> {
    const data = encode(message);
    const writer = this.#wstream.getWriter();
    await writer.ready;
    await writer.write(data);
    writer.releaseLock();
  }

  wait(msgid: number): Promise<unknown> {
    return this.#reservator.reserve(msgid);
  }

  #handleRequestMessage(message: RequestMessage): void {
    (async () => {
      const [_, msgid, method, params] = message;
      const [result, error] = await this.#dispatch(method, params);
      const response = buildResponseMessage(msgid, error, result);
      await this.send(response);
    })().catch((err) => this.#onUnexpectedError(message, err));
  }

  #handleNotificationMessage(
    message: NotificationMessage,
  ): void {
    (async () => {
      const [_, method, params] = message;
      const [__, err] = await this.#dispatch(method, params);
      if (err) {
        if (err instanceof Error) {
          throw err;
        } else {
          throw new Error(`${err}`);
        }
      }
    })().catch((err) => this.#onUnexpectedError(message, err));
  }

  #handleResponseMessage(message: ResponseMessage): void {
    const [_, msgid, err, result] = message;
    if (err) {
      let error: Error;
      if (err instanceof Error) {
        error = err;
      } else if (Array.isArray(err) && err.length === 2) {
        error = new Error(`${err[1]}`);
        error.name = `${err[0]}`;
      } else {
        error = new Error(`${err}`);
      }
      this.#reservator.reject(msgid, error);
    } else {
      this.#reservator.resolve(msgid, result);
    }
  }

  start(options: { signal?: AbortSignal } = {}): Promise<void> {
    const { signal } = options;
    const sink = new WritableStream({
      write: (message) => {
        if (isRequestMessage(message)) {
          this.#handleRequestMessage(message);
        } else if (isNotificationMessage(message)) {
          this.#handleNotificationMessage(message);
        } else if (isResponseMessage(message)) {
          this.#handleResponseMessage(message);
        } else {
          // Unknown message. Ignore it for forward compatibility.
          this.#onUnexpectedMessage(message);
        }
      },
    });
    return this.#rstream.pipeThrough(new DecodeStream()).pipeTo(sink, {
      signal,
    });
  }
}

function hasMethod(obj: unknown, method: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, method);
}

function defaultOnUnexpectedError(message: Message, err: Error): void {
  console.error(
    `Unexpected error for MessagePack-RPC message ${message}: ${err}`,
  );
}
