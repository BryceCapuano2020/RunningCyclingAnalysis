/**
 * The most activities the server computes for until the memory of a larger library is measured in workerd
 * (docs/design/server-compute.md, decision 11; apps/api/LIMITS.md records the figure). A bigger library computes in the browser.
 */
export const SERVER_STATE_MAX_ACTIVITIES = 2000
