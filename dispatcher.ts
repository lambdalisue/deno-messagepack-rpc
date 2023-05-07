/**
 * Dispatcher is a map of method names to functions used in Session.
 */
export type Dispatcher = {
  [key: string]: (...args: unknown[]) => unknown;
};

/**
 * DispatcherFrom is a type function that infers the type of Dispatcher from an actual type.
 */
export type DispatcherFrom<T> = {
  [K in keyof T]: T[K] extends (...args: infer Args) => unknown
    ? (...args: { [K in keyof Args]: unknown }) => unknown
    : never;
};

/**
 * NoMethodFoundError is an error thrown when a method is not found in Dispatcher.
 */
export class NoMethodFoundError extends Error {
  constructor(method: string) {
    super(`No MessagePack-RPC method '${method}' exists`);
    this.name = this.constructor.name;
  }
}

/**
 * Calls a method on a Dispatcher with the given parameters.
 */
export async function dispatch(
  dispatcher: Dispatcher,
  method: string,
  params: unknown[],
): Promise<unknown> {
  try {
    return await dispatcher[method](...params);
  } catch (err: unknown) {
    if (
      err instanceof TypeError &&
      !Object.prototype.hasOwnProperty.call(dispatcher, method)
    ) {
      throw new NoMethodFoundError(method);
    }
    throw err;
  }
}
