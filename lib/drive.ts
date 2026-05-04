import { google } from 'googleapis'

const FOLDER_NAME = 'JLPT_N3_Learning'

function getDriveClient(accessToken: string) {
  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })
  return google.drive({ version: 'v3', auth })
}

async function getOrCreateFolder(drive: ReturnType<typeof google.drive>, _accessToken: string): Promise<string> {
  {
  const promise = (async () => {
    const res = await drive.files.list({
      q: `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, createdTime)',
      spaces: 'drive',
      orderBy: 'createdTime',
    })

    const folders = res.data.files ?? []

    if (folders.length === 0) {
      const folder = await drive.files.create({
        requestBody: { name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
        fields: 'id',
      })
      console.log('[Drive] Created folder')
      return folder.data.id!
    }

    const primaryId = folders[0].id!

    // 自動合併多餘資料夾
    if (folders.length > 1) {
      console.log(`[Drive] Found ${folders.length} folders, merging...`)
      for (const extra of folders.slice(1)) {
        try {
          const files = await drive.files.list({
            q: `'${extra.id}' in parents and trashed=false`,
            fields: 'files(id, name)',
          })
          for (const file of files.data.files ?? []) {
            await drive.files.update({
              fileId: file.id!,
              addParents: primaryId,
              removeParents: extra.id!,
              fields: 'id',
            })
          }
          await drive.files.delete({ fileId: extra.id! })
          console.log(`[Drive] Merged and deleted duplicate folder`)
        } catch (e) {
          console.error(`[Drive] Failed to merge folder:`, e)
        }
      }
    }

    return primaryId
  })()

  return promise
}
}

export async function readDriveFile(accessToken: string, filename: string): Promise<unknown> {
  try {
    const drive = getDriveClient(accessToken)
    const folderId = await getOrCreateFolder(drive, accessToken)

    const res = await drive.files.list({
      q: `name='${filename}' and '${folderId}' in parents and trashed=false`,
      fields: 'files(id)',
      spaces: 'drive',
    })

    if (!res.data.files || res.data.files.length === 0) return null

    const content = await drive.files.get(
      { fileId: res.data.files[0].id!, alt: 'media' },
      { responseType: 'text' }
    )
    return JSON.parse(content.data as string)
  } catch (e) {
    console.error(`[Drive] Read error for ${filename}:`, e)
    return null
  }
}

export async function writeDriveFile(accessToken: string, filename: string, data: unknown): Promise<void> {
  try {
    const drive = getDriveClient(accessToken)
    const folderId = await getOrCreateFolder(drive, accessToken)

    const res = await drive.files.list({
      q: `name='${filename}' and '${folderId}' in parents and trashed=false`,
      fields: 'files(id)',
      spaces: 'drive',
    })

    const body = JSON.stringify(data, null, 2)
    const media = { mimeType: 'application/json', body }

    if (res.data.files && res.data.files.length > 0) {
      await drive.files.update({ fileId: res.data.files[0].id!, media })
    } else {
      await drive.files.create({
        requestBody: { name: filename, parents: [folderId] },
        media,
        fields: 'id',
      })
    }
  } catch (e) {
    console.error(`[Drive] Write error for ${filename}:`, e)
    throw e
  }
}
