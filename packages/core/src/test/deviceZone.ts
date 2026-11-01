import { setViewerZone } from '../calendar'

// The app gives the calendar the device's zone when the worker starts (`session.setZone`). A test file that is about
// the figures in the device's zone (it builds its instants with local fields, or sets the process zone) imports this
// so the calendar cuts its days there, as the app does. A file that does not keeps the calendar's default, UTC, and so
// holds in any process zone.
setViewerZone((ms) => -new Date(ms).getTimezoneOffset())
