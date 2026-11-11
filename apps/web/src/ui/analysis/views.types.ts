import type { AnalysisController } from './controller'
import type { BalanceView, LandingView, NoticesView, ProfileView, ResultView } from './views'

/*
 * Compile-time guard, checked by `tsc -b`: a page's view has no member outside its own list, so a page
 * typed with it cannot read one. Each @ts-expect-error fails the build if the member becomes reachable.
 */

declare const landing: LandingView
declare const balance: BalanceView
declare const result: ResultView
declare const profile: ProfileView
declare const notices: NoticesView

// @ts-expect-error Landing reads no results.
void landing.state
// @ts-expect-error Balance does not export data.
void balance.exportData
// @ts-expect-error The result pages do not adopt a device library.
void result.adoptDevice
// @ts-expect-error Profile does not add files.
void profile.addFiles
// @ts-expect-error The notices do not add files.
void notices.addFiles

// The controller still fits every view, so App passes it as it is.
const controller: AnalysisController = {} as AnalysisController
const views: [LandingView, BalanceView, ResultView, ProfileView, NoticesView] = [
  controller,
  controller,
  controller,
  controller,
  controller,
]
void views
