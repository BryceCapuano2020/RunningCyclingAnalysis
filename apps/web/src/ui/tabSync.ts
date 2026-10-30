import { useEffect } from 'react'

/**
 * What one tab tells the others. Messages carry only what changed, never data: the tab that hears one
 * reads the source of truth again (the stored value, the account, the library).
 */
export type TabMessage =
  /** The profile was saved on the account. */
  | { type: 'profile' }
  /** The session ended: signing out, a session that expired, a deleted account. */
  | { type: 'account'; change: 'signed-out' | 'expired' | 'deleted' }
  /** The account's dated settings were changed. */
  | { type: 'measurements' }

const CHANNEL = 'rca-sync-v1'

const ACCOUNT_CHANGES: ReadonlySet<unknown> = new Set(['signed-out', 'expired', 'deleted'])

/** What another tab sent, if it is a message this version knows. Anything else is ignored. */
function asTabMessage(data: unknown): TabMessage | null {
  if (typeof data !== 'object' || data === null || !('type' in data)) return null
  if (data.type === 'profile' || data.type === 'measurements') return { type: data.type }
  if (data.type === 'account' && 'change' in data && ACCOUNT_CHANGES.has(data.change)) {
    return data as TabMessage
  }
  return null
}

type Listener = (message: TabMessage) => void

let channel: BroadcastChannel | null | undefined
const listeners = new Set<Listener>()

/**
 * One channel for the tab. A channel does not hear its own messages, but another channel in the same
 * tab would, so every user in the tab shares this one. Where there are no channels (an older browser,
 * a test), nothing is sent and nothing is heard, and each tab simply learns of a change when it next
 * reads: the stored values stay right without it.
 */
function shared(): BroadcastChannel | null {
  if (channel !== undefined) return channel
  channel = null
  if (typeof BroadcastChannel === 'undefined') return channel
  try {
    channel = new BroadcastChannel(CHANNEL)
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const message = asTabMessage(event.data)
      if (message !== null) for (const listener of listeners) listener(message)
    }
  } catch {
    channel = null
  }
  return channel
}

/** Tells the other tabs. Never throws: a closed channel just means no one hears. */
export function tellOtherTabs(message: TabMessage): void {
  try {
    shared()?.postMessage(message)
  } catch {
    // The others learn at their next read.
  }
}

/** Calls `onMessage` for each message the other tabs send, for as long as the component is mounted. */
export function useTabMessages(onMessage: Listener): void {
  useEffect(() => {
    shared()
    listeners.add(onMessage)
    return () => {
      listeners.delete(onMessage)
    }
  }, [onMessage])
}

/** For tests: forget the channel, so the next use opens a fresh one. */
export function resetTabSync(): void {
  channel?.close()
  channel = undefined
  listeners.clear()
}
