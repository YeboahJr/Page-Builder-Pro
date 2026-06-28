import { Storage } from "@google-cloud/storage";

export const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

// Shared Google Cloud Storage client wired to the Replit sidecar credential
// endpoint. Used by both the api-server upload/delete paths and the scripts
// evidence backfill so the two never drift apart.
export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});
