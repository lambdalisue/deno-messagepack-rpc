/**
 * ErrorRecord is a serializable representation of an Error
 */
export type ErrorRecord = {
  name: string;
  message: string;
  stack?: string;
};

/**
 * Serialize error into ErrorRecord
 *
 * @param err Error to serialize
 */
export function serialize(err: unknown): ErrorRecord {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return {
    name: "Error",
    message: `${err}`,
  };
}

/**
 * Deserialize err into Error
 */
export function deserialize(err: unknown): Error {
  if (isErrorRecord(err)) {
    return Object.assign(new Error(), err);
  }
  return Object.assign(new Error(`${err}`), { stack: undefined });
}

/**
 * Check if the given value is an ErrorRecord
 *
 * @param err Value to check
 */
export function isErrorRecord(err: unknown): err is ErrorRecord {
  if (err === null || typeof err !== "object") {
    return false;
  }
  return "name" in err && "message" in err;
}
