/**
 * BroadcastChannel for page tests: channels of one name hear each other's messages, never their own,
 * as in a browser. `other()` is a channel standing for another tab.
 */
export class FakeBroadcastChannel {
  static all: FakeBroadcastChannel[] = []
  onmessage: ((event: MessageEvent) => void) | null = null
  closed = false

  readonly name: string

  constructor(name: string) {
    this.name = name
    FakeBroadcastChannel.all.push(this)
  }

  postMessage(data: unknown) {
    for (const channel of FakeBroadcastChannel.all) {
      if (channel !== this && channel.name === this.name && !channel.closed) {
        channel.onmessage?.({ data } as MessageEvent)
      }
    }
  }

  close() {
    this.closed = true
  }

  /** A channel for another tab, which posts to the tab under test and hears what it posts. */
  static other(name: string): FakeBroadcastChannel {
    return new FakeBroadcastChannel(name)
  }

  static reset() {
    FakeBroadcastChannel.all = []
  }
}
