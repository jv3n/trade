/** The release the backend was built from — what the environment is actually running. */
export interface AppVersion {
  /** The release tag, `v2.3.0-rc2` ; locally where the checkout stands, `v2.3.0-rc2-2-g8d53fd2`. */
  version: string;
  /** Short commit id, when the build carried its git properties. */
  commit: string | null;
  builtAt: Date | null;
  /** The environment answering, as the backend names it : `local`, `staging`, `prod`. */
  environment: string | null;
}
