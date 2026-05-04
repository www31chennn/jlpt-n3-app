import { google } from "googleapis";

const FOLDER_NAME = "JLPT_N3_Learning";

export function getGoogleAuth() {
  const credentials = {
    type: "service_account",
    project_id: process.env.GOOGLE_PROJECT_ID,
    private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    client_id: process.env.GOOGLE_CLIENT_ID,
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
  };

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });
  return auth;
}

export async function getOrCreateFolder(): Promise<string> {
  const auth = getGoogleAuth();
  const drive = google.drive({ version: "v3", auth });

  // Search for existing folder
  const res = await drive.files.list({
    q: `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id, name)",
  });

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id!;
  }

  // Create folder
  const folder = await drive.files.create({
    requestBody: {
      name: FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id",
  });

  return folder.data.id!;
}

export async function saveUserData(fileName: string, data: unknown): Promise<string> {
  const auth = getGoogleAuth();
  const drive = google.drive({ version: "v3", auth });
  const folderId = await getOrCreateFolder();

  const content = JSON.stringify(data, null, 2);

  // Check if file already exists
  const existing = await drive.files.list({
    q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
    fields: "files(id, name)",
  });

  if (existing.data.files && existing.data.files.length > 0) {
    // Update existing file
    const fileId = existing.data.files[0].id!;
    await drive.files.update({
      fileId,
      media: {
        mimeType: "application/json",
        body: content,
      },
    });
    return fileId;
  }

  // Create new file
  const file = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
      mimeType: "application/json",
    },
    media: {
      mimeType: "application/json",
      body: content,
    },
    fields: "id",
  });

  return file.data.id!;
}

export async function loadUserData(fileName: string): Promise<unknown | null> {
  const auth = getGoogleAuth();
  const drive = google.drive({ version: "v3", auth });
  const folderId = await getOrCreateFolder();

  const res = await drive.files.list({
    q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
    fields: "files(id, name)",
  });

  if (!res.data.files || res.data.files.length === 0) return null;

  const fileId = res.data.files[0].id!;
  const content = await drive.files.get({
    fileId,
    alt: "media",
  });

  return content.data;
}
