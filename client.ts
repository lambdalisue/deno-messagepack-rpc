import { Indexer } from "https://deno.land/x/indexer@v0.1.0/mod.ts";
import {
  buildNotificationMessage,
  buildRequestMessage,
  Message,
  msgidThreshold,
} from "./message.ts";

export type Sender = (message: Message) => void;

export type Waiter = (msgid: number) => Promise<unknown>;

export class Client {
  #indexer: Indexer = new Indexer(msgidThreshold);
  #sender: Sender;
  #waiter: Waiter;

  constructor(sender: Sender, waiter: Waiter) {
    this.#sender = sender;
    this.#waiter = waiter;
  }

  request(
    method: string,
    ...params: unknown[]
  ): Promise<unknown> {
    const msgid = this.#indexer.next();
    const message = buildRequestMessage(msgid, method, params);
    try {
      this.#sender(message);
      return this.#waiter(msgid);
    } catch (err) {
      const paramsStr = JSON.stringify(params);
      throw new Error(`Failed to request ${method}(${paramsStr}): ${err}`);
    }
  }

  notify<T extends unknown[]>(
    method: string,
    ...params: T
  ): void {
    const message = buildNotificationMessage(method, params);
    try {
      this.#sender(message);
    } catch (err) {
      const paramsStr = JSON.stringify(params);
      throw new Error(`Failed to notify ${method}(${paramsStr}): ${err}`);
    }
  }
}
