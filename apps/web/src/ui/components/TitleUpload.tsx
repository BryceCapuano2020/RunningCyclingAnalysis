import { useState } from 'react'
import { saveUploadTitles, storedUploadTitles } from '../uploadTitlesPreference'

export interface TitleUploadProps {
  /** The signed-in account the choice belongs to. */
  userId: string
}

/**
 * The choice to send the titles of activities to the library. Off, the library keeps a generated name such as
 * "Morning Run" and the title stays in the file. The choice is kept on this device and applies to what is saved
 * from now on.
 */
export function TitleUpload({ userId }: TitleUploadProps) {
  const [on, setOn] = useState(() => storedUploadTitles(userId) === true)
  return (
    <div className="file-retention">
      <label className="file-retention__choice">
        <input
          type="checkbox"
          checked={on}
          aria-describedby="title-upload-help"
          onChange={(event) => {
            saveUploadTitles(userId, event.target.checked)
            setOn(event.target.checked)
          }}
        />
        Send my activity titles to my library
      </label>
      <p id="title-upload-help" className="file-retention__help muted">
        A title can name a place or a route. Left off, your library keeps a name such as “Morning
        Run” for each activity and your titles stay in the files you import. This is kept on this
        device and applies to activities saved from now on.
      </p>
    </div>
  )
}
