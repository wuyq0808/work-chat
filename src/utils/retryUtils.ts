import retry from 'retry';

export interface RetryOptions {
  retries?: number;
  factor?: number;
  minTimeout?: number;
  maxTimeout?: number;
  randomize?: boolean;
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
  shouldRetry?: (error: Error) => boolean
): Promise<T> {
  const opts = {
    retries: 3,
    factor: 1,
    minTimeout: 0,
    maxTimeout: 0,
    randomize: false,
    ...options,
  };

  return new Promise((resolve, reject) => {
    const operation_retry = retry.operation(opts);

    operation_retry.attempt(async () => {
      try {
        const result = await operation();
        resolve(result);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));

        // If shouldRetry function is provided, use it to determine retry
        if (shouldRetry && !shouldRetry(err)) {
          reject(err);
          return;
        }

        if (operation_retry.retry(err)) {
          return;
        }

        reject(operation_retry.mainError());
      }
    });
  });
}

export function isGeminiPartsError(error: Error): boolean {
  return (
    error instanceof TypeError &&
    error.message.includes(
      "Cannot read properties of undefined (reading 'parts')"
    )
  );
}
