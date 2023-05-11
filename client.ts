import { Indexer } from "https://deno.land/x/indexer@v0.1.0/mod.ts";
import {
  buildNotificationMessage,
  buildRequestMessage,
  Message,
  msgidThreshold,
} from "./message.ts";

type Session = {
  send: (message: Message) => void;
  recv: (msgid: number) => Promise<unknown>;
};

export class Client {
  #indexer: Indexer = new Indexer(msgidThreshold);
  #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  call(
    method: string,
    ...params: unknown[]
  ): Promise<unknown> {
    const msgid = this.#indexer.next();
    const message = buildRequestMessage(msgid, method, params);
    try {
      this.#session.send(message);
      return this.#session.recv(msgid);
    } catch (err) {
      const paramsStr = params.map((v) => JSON.stringify(v)).join(", ");
      throw new Error(`Failed to call ${method}(${paramsStr}): ${err}`);
    }
  }

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
