import { Indexer } from "https://deno.land/x/indexer@v0.1.0/mod.ts";
import {
  buildNotificationMessage,
  buildRequestMessage,
  MSGID_THRESHOLD,
} from "./message.ts";
import { Session } from "./session.ts";

export class Invoker {
  #indexer: Indexer;
  #session: Session;

  constructor(
    session: Session,
  ) {
    this.#indexer = new Indexer(MSGID_THRESHOLD);
    this.#session = session;
  }

  async request(
    method: string,
    ...params: unknown[]
  ): Promise<unknown> {
    const msgid = this.#indexer.next();
    const message = buildRequestMessage(msgid, method, params);
    try {
      const [_, result] = await Promise.all([
        this.#session.send(message),
        this.#session.wait(msgid),
      ]);
      return result;
    } catch (err) {
      console.error(err);
      const paramsStr = JSON.stringify(params);
      const errStr = typeof err === "string" ? err : JSON.stringify(err);
      throw new Error(`Failed to request ${method}(${paramsStr}): ${errStr}`);
    }
  }

  async notify<T extends unknown[]>(
    method: string,
    ...params: T
  ): Promise<void> {
    const message = buildNotificationMessage(method, params);
    try {
      await this.#session.send(message);
    } catch (err) {
      const paramsStr = JSON.stringify(params);
      const errStr = typeof err === "string" ? err : JSON.stringify(err);
      throw new Error(`Failed to notify ${method}(${paramsStr}): ${errStr}`);
    }
  }
}
