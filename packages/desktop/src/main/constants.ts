type Channel = "dev" | "beta" | "prod"
const raw = import.meta.env.OPENCODE_CHANNEL
export const CHANNEL: Channel = raw === "dev" || raw === "beta" || raw === "prod" ? raw : "dev"

// microok fork: auto-updater permanently disabled — upstream feed would
// replace this app with official OpenCode. See docs/DIVERGENCE.md.
export const UPDATER_ENABLED = false
