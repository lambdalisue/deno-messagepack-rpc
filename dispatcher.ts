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
