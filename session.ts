import { Reservator } from "https://deno.land/x/reservator@v0.1.0/mod.ts";
import {
  DecodeStream,
  encode,
} from "https://deno.land/x/messagepack@v0.1.0/mod.ts";
import {
  buildResponseMessage,
  isMessage,
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

export class Session {
  #reservator: Reservator<MessageId, unknown>;
  #rstream: ReadableStream<Uint8Array>;
  #wstream: WritableStream<Uint8Array>;
  dispatcher: Dispatcher;

  constructor(
    rstream: ReadableStream<Uint8Array>,
    wstream: WritableStream<Uint8Array>,
  ) {
    this.#reservator = new Reservator();
    this.#rstream = rstream;
    this.#wstream = wstream;
    this.dispatcher = {};
  }

  async #dispatch(
    method: string,
    params: unknown[],
  ): Promise<[MessageResult, MessageError]> {
    try {
      if (!Object.prototype.hasOwnProperty.call(this.dispatcher, method)) {
        const propertyNames = Object.getOwnPropertyNames(this.dispatcher);
        throw new Error(
          `No method '${method}' exists in ${JSON.stringify(propertyNames)}`,
        );
      }
      const result = await this.dispatcher[method].apply(this, params);
      return [result, null];
    } catch (err) {
      console.error(err);
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
    })().catch(console.error);
  }

  #handleNotificationMessage(
    message: NotificationMessage,
  ): void {
    (async () => {
      const [_, method, params] = message;
      const [__, error] = await this.#dispatch(method, params);
      if (error) {
        throw new Error(`${error}`);
      }
    })().catch(console.error);
  }

  #handleResponseMessage(message: ResponseMessage): void {
    const [_, msgid, error, result] = message;
    if (error) {
      this.#reservator.reject(msgid, error);
    } else {
      this.#reservator.resolve(msgid, result);
    }
  }

  start(options: { signal?: AbortSignal } = {}): Promise<void> {
    const sink = new WritableStream({
      write: (message, controller) => {
        if (!isMessage(message)) {
          controller.error(
            new Error(`Invalid MessagePack payload: ${message}`),
          );
          return;
        }
        if (isRequestMessage(message)) {
          this.#handleRequestMessage(message);
        } else if (isNotificationMessage(message)) {
          this.#handleNotificationMessage(message);
        } else if (isResponseMessage(message)) {
          this.#handleResponseMessage(message);
        } else {
          controller.error(
            new Error(`Invalid MessagePack-RPC message type: ${message}`),
          );
          return;
        }
      },
    });
    return this.#rstream.pipeThrough(new DecodeStream()).pipeTo(sink, {
      signal: options.signal,
    });
  }
}
