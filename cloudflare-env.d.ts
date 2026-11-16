declare namespace Cloudflare {
  interface Env {
    ADMIN_SERVICE_KEY?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
