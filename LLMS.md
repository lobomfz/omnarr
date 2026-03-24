# Omnarr For LLMs

## Prerequisites

`bun` must already be installed. If not installed, you may install it with `curl -fsSL https://bun.sh/install | bash` or through the user's prefered package manager.

## Installation

### Step 1

Install Omnarr globally:

```bash
bun i -g omnarr
```

### Step 2 (required)

Save the Omnarr skill into your agent's skills directory as `omnarr/SKILL.md`:

```bash
mkdir -p "$SKILLS_DIR/omnarr"
curl -fsSL https://raw.githubusercontent.com/lobomfz/omnarr/refs/heads/main/SKILL.md -o "$SKILLS_DIR/omnarr/SKILL.md"
```

Replace `$SKILLS_DIR` with the root skills directory used by your agent. After saving it, read it.

### Step 3

Ask short questions, one step at a time:

1. Where should movies be stored?
2. Where should TV series be stored?
3. Which indexers should be enabled: `yts`, `beyond-hd`?
4. If `beyond-hd` is enabled, ask for `api_key` and `rss_key`.
5. Ask for qBittorrent `url`, `username`, and `password`. Set `category` to `omnarr`.

When asking about indexers, explain that `yts` is a public tracker and the recommended default.

Do not invent placeholder secrets or paths in the real config. If the user does not know a value yet, stop and explain what is still missing.

If qBittorrent Web UI is not enabled yet, instruct the user to enable the Web UI in qBittorrent settings and set the URL, username, and password to match what will be stored in the Omnarr config.

After collecting the answers:

1. Run `omnarr init --empty`.
2. Edit `~/.config/omnarr/config.json` with the user-provided values.
3. Confirm the final choices before moving on to search or download commands.

Use this shape for the config:

```json
{
  "$schema": "./schema.json",
  "root_folders": { "movie": "/media/movies", "tv": "/media/tv" },
  "indexers": [
    { "type": "yts" },
    { "type": "beyond-hd", "api_key": "...", "rss_key": "..." }
  ],
  "download_client": {
    "type": "qbittorrent",
    "url": "http://localhost:8080",
    "username": "admin",
    "password": "...",
    "category": "omnarr"
  }
}
```
