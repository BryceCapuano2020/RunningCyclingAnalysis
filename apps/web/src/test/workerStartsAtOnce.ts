/**
 * For the tests of the worker's own traffic: the worker starts with the page, as it does for a browser
 * that kept results, so a test can reach it without first making a request. Used as
 * vi.mock('<path>/analysis/workerStart', async () => (await import('<path>/test/workerStartsAtOnce')).workerStart).
 */
export const workerStart = { workerStartsWithPage: () => true }
