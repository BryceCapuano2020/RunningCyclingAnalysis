export function userFilePrefix(userId: string): string {
  return `users/${userId}/`
}

export function activityFileKey(userId: string, activityId: string): string {
  return `${userFilePrefix(userId)}${activityId}`
}

/** Deletes every object under prefix, page by page. Returns how many were deleted. */
export async function deleteByPrefix(
  bucket: R2Bucket,
  prefix: string,
  pageSize = 1000,
): Promise<number> {
  let deleted = 0
  let cursor: string | undefined
  do {
    const page = await bucket.list({ prefix, cursor, limit: pageSize })
    const keys = page.objects.map((object) => object.key)
    if (keys.length > 0) {
      await bucket.delete(keys)
      deleted += keys.length
    }
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor !== undefined)
  return deleted
}
